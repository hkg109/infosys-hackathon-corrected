import type { DatasetV2, ExchangeCatalog, MilitaryCatalog } from "@/contracts/types";
import exchangeRaw from "./exchange-2027-1.json";
import raw from "./infosys-2024-2027.json";
import militaryRaw from "./military-2026-11-08.json";

/**
 * 개발용 fixture. 공개 교육과정 화면에서 확인한 표본이며 DB 게시본이 아니다.
 * 운영 화면에서 DB 실패를 숨기는 용도로 쓰지 않는다.
 */
export const militaryFixture = militaryRaw as MilitaryCatalog;

/** 과목 자료 + 군 복무 트랙·자격증 검토 자료(병무청·발급기관 원문을 직접 확인한 날짜 포함) */
export const fixtureDataset = { ...(raw as DatasetV2), military: militaryFixture } as DatasetV2;

/** 교환학생: 2027-1 본모집 공고·파견교 엑셀(서울)에서 옮긴 자료. 2027-1 회차 전용이며 이후 학기에는 이전 회차 자료로만 쓴다. */
export const exchangeFixture = exchangeRaw as ExchangeCatalog;
