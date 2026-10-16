"use strict";
// Only synthetic content. Mirrors the new authored 3-line X and 4-section,
// 12-substep Y hierarchy without exposing any LIVE MASTER text.
const authoredX=[
  "가. 다중 계층 검증 (Layered Validation)",
  "나. 경계 간 신뢰 추적 (Trust Boundary Tracking)",
  "다. 단계별 결과 분류 (Stepwise Assessment)"
].join("\n");
const description=
  "합성 원문 설명을 요약하거나 삭제하지 않고 긴 줄을 감싸 표시하며, " +
  "중첩 괄호(A(B)C), RFC 8446 및 IEEE 802.1X, " +
  "13.56MHz·1.25 Gbps 수치·단위와 들여쓰기를 모두 유지하는지 확인";
const sections=[
  ["1. 링크 계층(L2, Data Link Layer):",["가) 연결 식별","나) 로컬 캐시","다) 링크 협상"]],
  ["2. 네트워크 계층(L3, Network Layer)",["가) 패킷 식별","나) 제어 메시지","다) 주소 할당","라) 경로 광고"]],
  ["3. 응용 계층(L7, Application Layer)",["가) 도메인 처리","나) 메시지 헤더","다) 응용 경계"]],
  ["4. 물리·생체 계층(Physical/Biometric Layer)",["가) 측위 신호","나) 입력 인증"]]
];
const authoredY=sections.map(([heading,steps])=>
  heading+"\n"+steps.map(s=>"  "+s+": "+description).join("\n")
).join("\n\n");
if(authoredX.split("\n").length!==3||authoredY.split("\n").length!==19||authoredY.length<1200)
  throw new Error("Synthetic hierarchy fixture shape unexpected");
module.exports=Object.freeze({authoredX,authoredY});
