# Gates: fundação PWA Treali

OWNS: Projetos/app-treali/**, docs/stories/app-treali/STORY-APP-TREALI.1-PWA-FOUNDATION.md

Scope: entregar a fundação PWA local, a API Vercel e os fluxos de atendimento definidos na Story 1.

## Acceptance inventory

Revision: 1

| ID | Required outcome or constraint | Source | Observer | Risk | Disposition |
| --- | --- | --- | --- | --- | --- |
| A1 | PWA TypeScript instalável e responsivo | Story 1 AC1-2 | G2, G5 | medium | ACTIVE |
| A2 | Sessão e carteira isoladas no servidor | Story 1 AC3-6, AC13 | G3, G6 | high | ACTIVE |
| A3 | Atendimento com GPS e SQLite principal | Story 1 AC8-12 | G3, G4 | high | ACTIVE |
| A4 | Testes e quality gates do app passam | Story 1 AC14-15 | G2-G6 | medium | ACTIVE |

- [x] G1: o ledger tem oráculos válidos
  CHECK: node /Users/marcelolacerda/.codex/skills/unlazy/scripts/gate-lint.mjs GATES.md
  EXPECT: LINT OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=414b26f5a0fede298fa969150bab02a9b57aea9aca6c6b31dfe6a3e1660ba95d; exit=0; EXPECT=matched; output-sha256=7b1bdcf4069943c35c16cd0e4711984b38fa5e73cf15280caadefc49205318d0; output-bytes=150; shell=/bin/sh; cwd=/Users/marcelolacerda/lab/aiox-core/Projetos/app-treali; path=d7f4598b4576/20 entries

- [x] G2: o projeto compila e gera os artefatos PWA
  CHECK: npm run build
  EXPECT: PWA build passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=00d74f35a5b7c7eae84024aa455bb8be2c2c0eca8b2388f3c684818db37c3d5c; exit=0; EXPECT=matched; output-sha256=d882b2bee27fe9588ff2bb1953a701b8a1858138bef36b5ef966e942b9295927; output-bytes=768; shell=/bin/sh; cwd=/Users/marcelolacerda/lab/aiox-core/Projetos/app-treali; path=d7f4598b4576/20 entries

- [x] G3: os testes de domínio, API e isolamento passam
  CHECK: npm test
  EXPECT: storage policy verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=b60360e7c7edc12dd324f570aa9283c536bd529a1e776e07d79fda8888e11a6e; exit=0; EXPECT=matched; output-sha256=2caa98198f86a1d025cf35ec70ebcb0854813a7d15458d6431e2f720cc085dad; output-bytes=1410; shell=/bin/sh; cwd=/Users/marcelolacerda/lab/aiox-core/Projetos/app-treali; path=d7f4598b4576/20 entries

- [x] G4: as verificações de armazenamento validam o bloqueio seguro sem SQLite/OPFS
  CHECK: node tests/verify-storage-policy.mjs
  EXPECT: storage policy verification passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=e340b82ca841508480ff2a59630f05cf1a5035e214ae6eff3ed25952e8b713a8; exit=0; EXPECT=matched; output-sha256=205abbb3deb9a7004db491997ec2dec51c6a7037eb636dccd30a0fbff1bfa928; output-bytes=35; shell=/bin/sh; cwd=/Users/marcelolacerda/lab/aiox-core/Projetos/app-treali; path=d7f4598b4576/20 entries

- [x] G5: lint e checagem de tipos passam
  CHECK: npm run lint && npm run typecheck
  EXPECT: tsc --noEmit
  EVIDENCE: automatic-evidence=v1; definition-sha256=6fcabbbbad2312227faa9af2dc48d9271121683343889ab18b8003d17a1fd549; exit=0; EXPECT=matched; output-sha256=8244094b0d6362110a8bb96086440c2fec47eeaaa1ba68fe16f5912a1740f787; output-bytes=126; shell=/bin/sh; cwd=/Users/marcelolacerda/lab/aiox-core/Projetos/app-treali; path=d7f4598b4576/20 entries

- [x] G6: revisão manual confirma que o precache não inclui dados de clientes
  EVIDENCE: Manual em 2026-09-28: `SHELL` contém apenas HTML e manifest; o handler retorna antes de `/api/`; catálogo gerado não é referenciado pelo service worker.
