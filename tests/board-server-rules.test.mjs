// 에뮬레이터에서 학생·교사·서버 전용 경로의 실제 규칙을 검증한다.
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const emulator =
  !!process.env.FIREBASE_DATABASE_EMULATOR_HOST &&
  !!process.env.FIREBASE_STORAGE_EMULATOR_HOST;
test(
  "RTDB and Storage enforce verified teacher and server-only boundaries",
  { skip: !emulator },
  async () => {
    const {
      initializeTestEnvironment,
      assertFails,
      assertSucceeds,
    } = require("@firebase/rules-unit-testing");
    const { ref, get, set } = require("firebase/database");
    const { ref: sref, uploadBytes, getBytes } = require("firebase/storage");
    const [host, port] = process.env.FIREBASE_DATABASE_EMULATOR_HOST.split(":"),
      [shost, sport] = process.env.FIREBASE_STORAGE_EMULATOR_HOST.split(":");
    const env = await initializeTestEnvironment({
      projectId: "soc-c-qna",
      database: {
        host,
        port: +port,
        rules: await readFile(
          new URL("../database.rules.json", import.meta.url),
          "utf8",
        ),
      },
      storage: {
        host: shost,
        port: +sport,
        rules: await readFile(
          new URL("../storage.rules", import.meta.url),
          "utf8",
        ),
      },
    });
    try {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await set(ref(ctx.database(), "questions/test"), {
          title: "Secret",
          text: "Private",
          isSecret: true,
        });
        await set(ref(ctx.database(), "boardCredentials/questions/test"), {
          hash: "private",
        });
      });
      const anon = env.unauthenticatedContext(),
        student = env.authenticatedContext("student"),
        teacher = env.authenticatedContext("teacher", {
          email: "leetae712@gmail.com",
          email_verified: true,
        }),
        fake = env.authenticatedContext("fake", {
          email: "leetae712@gmail.com",
          email_verified: false,
        });
      for (const ctx of [anon, student, fake]) {
        await assertFails(get(ref(ctx.database(), "questions")));
        await assertFails(
          set(ref(ctx.database(), "questions/test/text"), "forged"),
        );
        await assertFails(
          uploadBytes(
            sref(ctx.storage(), "images/forged"),
            new Uint8Array([1]),
            { contentType: "image/png" },
          ),
        );
      }
      await env.withSecurityRulesDisabled(async ctx => { await set(ref(ctx.database(), "members"),{student:{h:"a".repeat(64)},other:{h:"b".repeat(64)}}); });
      await assertSucceeds(get(ref(teacher.database(), "members")));
      await assertSucceeds(get(ref(student.database(), "members/student")));
      for (const ctx of [anon,student,fake]) await assertFails(get(ref(ctx.database(), "members")));
      await assertFails(get(ref(student.database(), "members/other")));
      await assertSucceeds(get(ref(teacher.database(), "questions")));
      await assertSucceeds(
        set(ref(teacher.database(), "questions/test/replies/reply"), {
          text: "Teacher answer",
          time: "2026/09/16 AM 9:00",
          isTeacher: true,
        }),
      );
      await assertFails(get(ref(teacher.database(), "boardCredentials")));
      await assertFails(
        set(
          ref(teacher.database(), "questions/test/password"),
          "new plaintext",
        ),
      );
      await assertSucceeds(
        uploadBytes(
          sref(teacher.storage(), "images/teacher"),
          new Uint8Array([1]),
          { contentType: "image/png" },
        ),
      );
      await assertFails(getBytes(sref(student.storage(), "images/teacher")));
    } finally {
      await env.cleanup();
    }
  },
);
