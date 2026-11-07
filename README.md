# 아 맞다, 인생! — 정보시스템학과 MVP

정보시스템학과에서 무엇을 듣고, 언제 준비할지. 내 진로와 일정에 맞춰 학기별로 설계하는 플래너.

## 시작하기

Node.js 22 이상.

```bash
npm ci
cp .env.example .env.local   # 기본값은 fixture 자료로 동작
npm run dev
```

http://localhost:3000

## 검증

```bash
npm run check   # typecheck + lint + test
npm run build
```

## 자료 출처 모드

| `CATALOG_SOURCE` | 설명 |
|---|---|
| `fixture` (기본) | `src/data/fixtures`의 개발용 검토 자료 |
| `supabase` | 게시된 DB 버전. `SUPABASE_URL`, `SUPABASE_ANON_KEY` 필요 |

DB 스키마: `supabase/migrations/0001_catalog.sql`

구조와 작업 규칙은 [CLAUDE.md](CLAUDE.md)를 참고하세요.
