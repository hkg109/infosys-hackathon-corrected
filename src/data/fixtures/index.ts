import type { DatasetV2 } from "@/contracts/types";
import raw from "./infosys-2024-2027.json";

/**
 * 개발용 fixture. 공개 교육과정 화면에서 확인한 표본이며 DB 게시본이 아니다.
 * 운영 화면에서 DB 실패를 숨기는 용도로 쓰지 않는다.
 */
export const fixtureDataset = raw as DatasetV2;
