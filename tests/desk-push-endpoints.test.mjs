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

test("게시판 세 곳의 모든 쓰기(Desk 의 직접 쓰기 포함)가 판 번호를 올리는 트리거에 걸려 있다", () => {
  for (const [name, ref] of [
    ["boardVersionQuestions", "questions/{id}"],
    ["boardVersionFeedback", "feedback/{id}"],
    ["boardVersionSupport", "support/{id}"],
  ]) {
    const endpoint = functions[name]?.__endpoint;
    assert.equal(endpoint?.platform, "gcfv2", name);
    assert.equal(endpoint?.eventTrigger?.eventType, "google.firebase.database.ref.v1.written");
    assert.equal(endpoint?.eventTrigger?.eventFilters?.instance, "soc-c-qna-default-rtdb");
    assert.equal(endpoint?.eventTrigger?.eventFilterPathPatterns?.ref, ref);
  }
});
