import test from "node:test";
import assert from "node:assert/strict";
import * as functions from "../functions/index.mjs";

test("질문과 학생 추가 질문은 운영 RTDB 생성 즉시 APNs secret 연결 함수로 전달된다", () => {
  const expected = [
    ["deskQuestionPush", "questions/{qid}"],
    [
      "deskStudentFollowupPush",
      "questions/{qid}/replies/{rid}/subReplies/{sid}",
    ],
  ];
  for (const [name, ref] of expected) {
    const endpoint = functions[name]?.__endpoint;
    assert.equal(endpoint?.platform, "gcfv2");
    assert.deepEqual(endpoint?.region, ["us-central1"]);
    assert.equal(
      endpoint?.eventTrigger?.eventType,
      "google.firebase.database.ref.v1.created",
    );
    assert.equal(
      endpoint?.eventTrigger?.eventFilters?.instance,
      "soc-c-qna-default-rtdb",
    );
    assert.equal(endpoint?.eventTrigger?.eventFilterPathPatterns?.ref, ref);
    assert.deepEqual(endpoint?.secretEnvironmentVariables, [
      { key: "DESK_APNS_CREDENTIAL" },
    ]);
  }
});

test("클라우드 재시도는 Mac이 잠든 동안에도 매분 실행된다", () => {
  const endpoint = functions.deskPushRetry?.__endpoint;
  assert.equal(endpoint?.scheduleTrigger?.schedule, "every 1 minutes");
  assert.equal(endpoint?.scheduleTrigger?.timeZone, "Asia/Seoul");
  assert.deepEqual(endpoint?.secretEnvironmentVariables, [
    { key: "DESK_APNS_CREDENTIAL" },
  ]);
});
