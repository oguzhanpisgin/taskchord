# TaskChord — Ürün ve Uygulama Planı

**Ürün:** TaskChord  
**Açıklama:** From issue to reviewed PR  
**Extension ID:** `taskchord.taskchord`  
**CLI:** `taskchord doctor`  
**Ana panel:** TaskChord Workbench  
**Kanıt görünümü:** TaskChord Proof  
**Depo:** Kişisel GitHub hesabında, herkese açık `taskchord` deposu  
**Lisans:** Apache-2.0
**Tarih:** 30 Ağustos 2026  
**Plan durumu:** Slice 001–004 tamamlandı; sıradaki aday Slice 005

## 1. Ürün kararı

**TaskChord, Codex kullanıcısının ortamını doğrulayan, niyetini kalıcı bir GitHub Issue sözleşmesine dönüştüren ve ajan çıktısını deterministik kanıtlarla insan incelemesine hazırlayan IDE-native güven ve iş akışı katmanıdır.**

TaskChord yeni bir coding agent, tracker veya orkestratör yazmaz. Kullanıcının kurulum, görev tanımı, iş görünürlüğü ve “gerçekten bitti mi?” boşluklarını kapatır.

## 2. Bağlayıcı sahiplik sınırı

```text
GitHub    = kalıcı iş, PR ve CI gerçeği
Codex     = tek kod yazıcısı
Symphony  = opsiyonel orkestratör
TaskChord = sözleşme + görünürlük + kanıt
İnsan     = son hakem
```

Bu sınır şu kuralları doğurur:

- TaskChord repo kodunu kendisi üretmez veya kullanıcı eylemi olmadan değiştirmez.
- TaskChord, Codex'in agent loop'unu veya Symphony'nin dispatch/retry/workspace mantığını yeniden uygulamaz.
- GitHub Issue, PR ve CI kayıtları kalıcı gerçektir; TaskChord ikinci bir backlog oluşturmaz.
- Symphony olmadan da Issue → Codex handoff → Proof → human review ana değer zinciri çalışır.
- Codex'in mevcut IDE deneyimi tekrar yapılmaz. Resmî IDE eklentisi zaten açık dosya ve selection bağlamını, yerinde değişiklik incelemeyi ve uzun işleri devretmeyi sağlar.
- İnsan kararı test, CI veya agent mesajından türetilmez; ayrı bir kanıt şerididir.

## 3. Bugünkü durum

### Tamamlanan Slice 001

- Strict TypeScript/pnpm monorepo temeli.
- Windows, WSL, macOS, Linux ve unknown ortam tespiti.
- Async ve birden fazla kontrolü taşıyabilen ortak DoctorReport temeli.
- Tüm kontrol listesini gösteren text/JSON CLI ve native Setup view.
- Her kontrolü sayarak başarısızlığa öncelik veren readiness özeti.
- TaskChord Workbench altında native Setup, Work ve Proof view'ları.
- Yalnız kullanıcı isteğiyle çalışan salt-okunur `Run Doctor` komutu ve extension smoke testi.

Slice 001 doctor çekirdeği atılmayacaktır. Slice 002'de TaskChord Doctor Aggregator'ın environment katmanı olarak genişletilecektir.

### Henüz uygulanmayanlar

- Native Codex doctor, Git, GitHub, Node, WSL ve repository readiness toplama.
- GitHub authentication veya Issue/PR yazmaları.
- Issue Contract, Goal, Intent Scaffold ve Proof toplama.
- Symphony veya Codex App Server bağlantısı.
- Installer reçeteleri, remote, push veya Marketplace yayını.

## 4. Kullanıcı problemi ve ürün karşılığı

| Kullanıcı sorunu | Kök neden | TaskChord karşılığı |
|---|---|---|
| Kurulumun hangi makine veya ortamda eksik olduğu anlaşılmıyor | Windows host, WSL workspace ve araç oturumları birbirine karışıyor | Ortam etiketli Doctor Aggregator |
| Çalışan bir araç yanlışlıkla “yok” sayılabiliyor | PATH, shell startup veya yetki hatası eksiklik gibi yorumlanıyor | Kaynak, hata türü ve kanıtı ayrı gösteren kontroller |
| Kullanıcı doğru promptu kuramıyor | Boş metin alanı görev sınırı ve doğrulama üretmiyor | Deterministik Issue Contract / Intent Scaffold |
| Uzun işte amaç ve kabul ölçütleri kayboluyor | Sohbet bağlamı kalıcı iş sözleşmesi değil | GitHub Issue içinde görünür Goal ve kabul alanları |
| Agent “bitti” dediğinde iş review-ready olmayabiliyor | Build, test, commit, PR, CI ve insan kararı birbirine karışıyor | Ayrı ve deterministik TaskChord Proof şeritleri |
| IDE, CLI, GitHub ve orkestrasyon arasında gidip geliniyor | Akışın kullanıcı tarafında tek sahibi yok | Native TaskChord Workbench |
| Komut adları bilinmiyor | Kullanıcının amacı ile teknik komut adı aynı şey değil | TreeView eylemleri, Command Palette ve walkthrough |

## 5. Desteklenen yüzeyler

| Yüzey | Planlanan destek |
|---|---|
| Visual Studio Code Desktop | MVP ana hedefi ve VS Marketplace dağıtım yüzeyi |
| VS Code Remote WSL | MVP Windows/WSL hedefi |
| Cursor | Open VSX ve ayrı uyumluluk testinden sonra beta |
| Windsurf | Ayrı uyumluluk testinden sonra beta |
| VS Code Web | Yerel process ve araç kontrolleri nedeniyle desteklenmez |
| Xcode / JetBrains | Aynı VSIX çalışmaz; ayrı ürün yüzeyi gerekir |
| Codex/ChatGPT Desktop | VSIX kurulmaz; gelecekte ortak çekirdek kullanan ayrı paket değerlendirilebilir |

Resmî [Codex IDE extension](https://learn.chatgpt.com/docs/codex/ide) editor bağlamı, yerinde inceleme ve handoff deneyiminin sahibidir. TaskChord bu yüzeyi kopyalamak yerine kalıcı sözleşme ve kanıt akışını tamamlar.

## 6. Ürün mimarisi

```text
TaskChord Workbench
│
├── Setup
│   └── Doctor Aggregator
│       ├── Slice 001 environment detection
│       ├── codex doctor --json
│       ├── Git / GitHub auth
│       ├── Node / pnpm
│       ├── Windows host ↔ WSL workspace
│       ├── repository readiness
│       └── optional Symphony / WORKFLOW.md health
│
├── Work
│   └── Issue Contract
│       ├── Outcome
│       ├── Boundaries
│       ├── Acceptance
│       ├── Verification
│       └── Goal
│
└── Proof
    ├── Changed files
    ├── Build
    ├── Tests
    ├── Commit
    ├── PR / CI
    └── Human decision
```

### Katmanlar

```text
VS Code Extension
├── Native Workbench views
├── Commands and walkthroughs
└── Presentation adapters

TaskChord Core
├── Doctor aggregation
├── Issue Contract
├── deterministic readiness rules
└── Proof projection

Internal ports
├── GitHub Issues / PR / Checks
├── Git and repository state
├── Codex CLI handoff
└── optional runner observations

External truth
├── GitHub
├── local or WSL workspace
├── Codex
└── optional Symphony
```

MVP'de tracker abstraction veya public Module SDK yayımlanmaz. GitHub tek iş sağlayıcısıdır. Internal portlar yalnız çekirdeği test edilebilir tutacak kadar dar olur; v1 sonrası gerçek kullanım kanıtı oluşursa sürümlü SDK çıkarılır.

## 7. Setup — Doctor Aggregator

### Sorumluluk

`taskchord doctor` Codex'in kendi teşhisini taklit etmez. Native `codex doctor --json` çıktısını TaskChord'a özgü environment, Git, GitHub, Node/pnpm, WSL ve repository readiness kontrolleriyle tek raporda birleştirir.

Her kontrol:

- hangi execution environment'ta çalıştığını,
- hangi kaynaktan ölçüldüğünü,
- sonucu ve hata sınıfını,
- kullanıcıya önerilen sonraki eylemi

gösterir. Erişilemeyen veya doğrulanamayan bir kontrol yeşil sayılmaz.

Slice 001 bu aggregator sözleşmesini tek `environment` kontrolüyle başlatır. Rapor özeti bütün kontrollerden türetilir: herhangi bir `failed` sonuç raporu `failed`, aksi hâlde herhangi bir `unverified` sonuç raporu `unverified` yapar; boş kontrol listesi `ready` sayılamaz. Hedef ortam, kaynak ve sonraki eylem gibi yeni üretici alanları gerçek kontrolleriyle birlikte Slice 002'de sürümlenecektir.

### Windows ve WSL

Windows host ve WSL workspace ayrı hedeflerdir. Örnek:

```text
Windows host          Ready
WSL distribution      Ready
Workspace location    Needs action: Reopen in WSL
GitHub auth (Windows) Ready
GitHub auth (WSL)     Missing
Codex (WSL)           Ready
```

TaskChord bir Windows sonucunu WSL için veya bir WSL sonucunu Windows için yeniden kullanmaz.

### Doctor ve installer ayrımı

Doctor daima salt-okunurdur. Kurulum yardımının ilk modeli:

```text
algıla → açıkla → komutu veya dosya farkını göster → açık kullanıcı onayı → yeniden ölç
```

MVP'de kör `Fix All`, sessiz PATH/profile değişikliği, credential kopyalama veya otomatik elevation yoktur. İlk reçeteler kullanıcıya doğru ortamda çalıştıracağı komutu gösterir; sistem değişikliği ancak ilgili dilimde ayrıca onaylanır.

## 8. Work — Issue Contract

GitHub Issue, TaskChord işinin kalıcı kaynağıdır. Kullanıcı GitHub web sayfasını açmadan IDE içinde Issue listeleyebilir ve oluşturabilir; dış yazma öncesinde tam önizleme görür.

Her iş sözleşmesinin çekirdeği:

```text
Outcome       Beklenen sonuç nedir?
Boundaries    Ne değişmemeli; hangi işlem izin ister?
Acceptance    Sonucun kabul edileceği ölçütler nelerdir?
Verification  Hangi test, komut veya gözlem kanıt sayılır?
Goal          Uzun iş boyunca korunacak kısa amaç nedir?
```

Goal ayrı bir servis değildir. Issue Contract içinde görünür ve düzenlenebilir bir alan ile Work item üzerindeki bir düğmedir. Uzun bağlam Issue gövdesinde, kısa ve kalıcı amaç Goal alanında tutulur.

### Intent Scaffold

MVP'deki prompt yardımı deterministiktir:

- Eksik Outcome, Boundaries, Acceptance veya Verification alanlarını gösterir.
- Kullanıcının metnini sessizce yeniden yazmaz.
- Sahte bir kalite puanı üretmez.
- Önerilen eklemeleri gerekçesiyle gösterir.
- Kullanıcı onayı olmadan Issue veya Codex işi başlatmaz.

Otonom AI prompt rewriting MVP kapsamı dışındadır. İleride eklenirse gönderilecek bağlam ve ortaya çıkan fark açıkça gösterilir.

### Native eylemler

Kullanıcı slash komutlarını ezberlemek zorunda değildir. Goal belirleme, plan hazırlama, değişiklik inceleme, durum görme, izinleri anlama ve teşhis çalıştırma; ayrı büyük bir ürün yüzeyi yerine:

- Workbench TreeView eylemleri,
- VS Code Command Palette,
- ilk kullanım walkthrough adımları

olarak sunulur. Önerilen eylem otomatik çalışmaz.

### Codex handoff

İlk çalışan yol native IDE/CLI handoff'tur. TaskChord Issue Contract'tan kullanıcı onaylı bir görev üretir ve Codex'in mevcut yüzeyine aktarır. TaskChord, Codex extension'ın private API'lerine bağımlı olmaz.

## 9. Proof — deterministik güven katmanı

TaskChord Proof, “agent tamamladı” mesajını başarı kabul etmez. Her şerit kendi kanıtı ve durumuyla gösterilir:

```text
Changed files    Git diff / file list
Build            command + exit result
Tests            test command + passed/failed/skipped
Commit           commit identity veya missing
PR / CI          PR link + checks state
Human decision   pending / changes requested / accepted
```

Durumlar şerit bazında hesaplanır. Eksik veya doğrulanamayan bir şerit genel bir yeşil rozetin altında gizlenmez. `Ready for human review`, gerekli teknik şeritlerin geçtiğini ve insan kararının beklendiğini ifade eder; `Accepted` yalnız insan kararıyla oluşur.

MVP sunumu native TreeView ve açılabilir Markdown/virtual document kullanır. Zengin webview ancak gerçek kullanıcı testi native yüzeyin yetersiz olduğunu gösterirse değerlendirilir.

## 10. GitHub yazmaları ve izin modeli

TaskChord iki farklı dış etkiyi ayırır:

1. **Repository code write:** TaskChord, Codex'i başlatmadan önce hedef repository/workspace'i, onaylanan Issue Contract'ı, Boundaries alanını, seçilen yazma/izin modunu ve yazıcının Codex olduğunu gösterir. Kullanıcı bu önizlemeden sonra işi açıkça başlatır; oluşan dosya farkları Codex/IDE incelemesi ve Proof içinde kabulden önce yeniden görünür olur. TaskChord doğrudan kod yazıcısı değildir.
2. **Workflow write:** GitHub Issue, comment veya TaskChord metadata güncellemesidir. Hedef, tam içerik ve etki önceden gösterilir; repository code write izninden ayrı kullanıcı onayı ister.

İzin seviyeleri:

```text
Observe   Setup, work ve proof oku
Prepare   Issue Contract ve handoff taslağı hazırla
Write     Önizlenen Issue/comment/metadata değişikliğini uygula
Execute   Kullanıcı eylemiyle Codex veya opsiyonel runner başlat
Publish   PR/merge gibi dış etkileri ayrıca onayla
```

Ek güvenlik kuralları:

- Untrusted workspace'te write ve process eylemleri kayıtlı veya aktif olmaz.
- Token değerleri loglanmaz, workspace'e yazılmaz veya ortamlar arasında kopyalanmaz.
- Dirty repository korunur; reset, checkout veya cleanup yapılmaz.
- Mevcut `WORKFLOW.md` veya Codex config'i fark gösterilmeden değiştirilmez.
- Telemetry MVP'de kapalıdır.
- Merge hiçbir zaman varsayılan otomatik eylem değildir.

## 11. Opsiyonel runner kararları

### Symphony

Symphony MVP önkoşulu değildir. Eklendiğinde TaskChord scheduler veya orkestratör olmaz; yalnız desteklenen sürümü ve sağlık/state bilgisini okur, kullanıcı onaylı dispatch metadata'sını GitHub'a yazar ve blocked durumunu görünür kılar.

Symphony bulunmadığında Issue Contract, native Codex handoff ve Proof çalışmaya devam eder.

### Codex App Server

Resmî [Codex App Server](https://learn.chatgpt.com/docs/app-server), authentication, conversation history, approvals ve streamed agent events gerektiren zengin istemciler için doğru derin entegrasyon yüzeyidir. TaskChord bunu ilk MVP yolu yapmaz.

Gerçek ihtiyaç kanıtlanırsa entegrasyon:

- kurulu Codex sürümünü doğrular,
- o sürümden üretilen şemayı kullanır,
- capability negotiation yapar,
- varsayılan yerel stdio transport'u tercih eder,
- onay isteklerini sessizce kabul etmez,
- desteklenmeyen capability'de native handoff'a geri düşer.

## 12. Yayın ve genişletilebilirlik

İlk yayın hedefi VS Code Marketplace pre-release'tir. Cursor/Windsurf için Open VSX paketi aynı koddan üretilebilir ancak destek etiketi ayrı uyumluluk testi sonrasında verilir.

Genişletilebilirlik sırası:

1. MVP'de dar internal ports.
2. TaskChord'un GitHub, Codex ve Proof bileşenleriyle gerçek kullanım.
3. v1 sonrası kararlı sözleşmelerden versioned Module SDK.
4. Daha sonra ek proof collectors veya opsiyonel runner adaptörleri.

MVP'de çoklu tracker, module registry, bulut servisi veya ayrı web dashboard yoktur.

## 13. Dilim yol haritası

### Slice 001 — Native Workbench + read-only environment doctor — tamamlandı

- Ortak contracts ve environment detection.
- Async, multi-check DoctorReport ve bütün kontrollerden türetilen özet.
- Aynı kontrol listesini sunan CLI text/JSON çıktısı ve native Setup view.
- Kullanıcı tetiklemeli Doctor ile Setup, Work ve Proof native view shell'i.

### Slice 002 — Doctor Aggregator v2 — tamamlandı

- Native `codex doctor --json` sonucunu güvenli biçimde toplama.
- Git, GitHub, Node/pnpm, WSL ve repository readiness kontrolleri.
- Windows host ile WSL workspace'i ayrı target olarak modelleme.
- CLI ve Setup view için aynı aggregate report.
- Tamamen salt-okunur davranış.

### Slice 003 — Issue Contract + Goal — tamamlandı

- IDE içinde GitHub Issue listeleme, tam önizlemeli oluşturma ve düzenleme.
- Outcome, Boundaries, Acceptance, Verification ve Goal alanları.
- Deterministik Intent Scaffold.
- Issue yazması ve Codex handoff için ayrı önizleme/onay.
- Yerel Active Goal projection; GitHub'a ek metadata yazılmaz.
- Belirsiz create uzlaştırması ve edit conflict/readback koruması.
- Canlı GitHub create/edit kabul kanıtı tamamlandı. `oguzhanpisgin/taskchord` deposunda Issue #5 için onaylanmış yük (`create` ve `edit`) birebir readback ile doğrulandı, ardından issue `completed` gerekçesiyle kapatıldı; yorum, label veya metadata eklenmedi ve depo çalışma ağacı temiz kaldı.

### Slice 004 — Deterministic Proof — tamamlandı

- Changed files, Build, Tests, Commit, PR/CI ve Human decision şeritleri.
- Eksik, failed, unverified veya stale kanıtı gizlemeyen review-readiness hesabı.
- Seçili workspace kökündeki `build`/`build:*` ve `test`/`test:*` package script'leri için değişmez Markdown önizleme ve ayrı modal onay.
- VS Code Tasks üzerinden yalnız TaskChord'un oluşturduğu, run-id ile izlenen doğrulama görevleri; serbest komut veya Issue metni çalıştırılmaz.
- Başlangıç/bitiş workspace fingerprint'i, script-definition hash'i ve exit sonucuna bağlı kalıcı Build/Test kanıtı.
- Teknik eksikler varken de verilebilen fakat kanıt değişince `stale` olan açık yerel Human decision.
- Native Proof view ve açılabilir ayrıntı belgesi; GitHub review yalnız provenance olarak kalır.

### Slice 005 — Optional runners

- Symphony salt-okunur health/state adaptörü.
- Gerçek ihtiyaç kanıtlanırsa sürüm ve capability kontrollü Codex App Server istemcisi.
- Runner yokken native Codex handoff'a güvenli düşüş.

Her dilim ayrı kabul ölçütü ve açık sahip onayıyla başlar. Bir dilimin tamamlanması sonrakine otomatik uygulama izni vermez.

## 14. MVP kapsamı ve başarı ölçümü

### MVP'de olacaklar

- Cross-platform Doctor Aggregator.
- Native Setup, Work ve Proof yüzeyleri.
- GitHub Issue Contract ve Goal.
- Deterministik Intent Scaffold.
- Native Codex handoff.
- Deterministik Proof.
- VS Marketplace pre-release.

### MVP'de olmayacaklar

- Jira, Linear, Asana veya GitLab tracker desteği.
- Zorunlu Symphony kurulumu.
- Zorunlu Codex App Server bağlantısı.
- Otonom prompt rewriting.
- Otomatik sistem değişikliği veya onaysız publish/merge.
- Public Module SDK.
- Çoklu repo organization dashboard'u.
- Web dashboard veya ayrı bulut servisi.

### Ölçülebilir hedef

En az 20 gerçek görevle yapılan MVP değerlendirmesinde:

- kullanıcıların en az `%60`ı IDE dışına çıkmadan Issue → review-ready PR zincirini tamamlamalı,
- tamamlanan zincirlerde medyan süre 15 dakikanın altında olmalı,
- başarısız görevlerde eksik veya failed kanıtın hangi şeritte olduğu görünür olmalı.

Bu metrik ürün hedefidir; sahte demo verisiyle “başarıldı” olarak işaretlenmez.

## 15. Ürün kabul ölçütleri

MVP ancak aşağıdakiler gerçek görevlerle kanıtlandığında hazır sayılır:

- Windows kullanıcısı host ve WSL workspace durumunu birbirinden ayırabiliyor.
- Kullanıcı GitHub web sitesini açmadan Issue Contract oluşturabiliyor.
- Retry duplicate Issue üretmiyor.
- Intent Scaffold niyeti değiştirmeden eksik sınır ve doğrulamayı gösteriyor.
- Goal GitHub Issue içinde kalıcı ve görünür.
- Symphony olmadan ana Issue → Codex → Proof akışı çalışıyor.
- Proof, build/test başarısını commit, PR/CI ve insan kararından ayrı gösteriyor.
- Untrusted workspace'te yazma ve process eylemleri kapalı.
- Extension kaldırıldığında repo, Git config veya credential durumu bozulmuyor.
- MVP başarı metriği gerçek görev verisiyle raporlanıyor.

## 16. Ana riskler ve karşılıkları

| Risk | Karşılık |
|---|---|
| TaskChord'un orkestratör-üstü-orkestratöre dönüşmesi | Bağlayıcı sahiplik sınırı; scheduler veya agent loop yok |
| Codex doctor ile mükerrer teşhis | Native JSON sonucunu saran TaskChord-specific aggregator |
| Windows/WSL false-ready | Host ve workspace için ayrı evidence ve auth kontrolleri |
| Prompt yardımının niyeti bozması | Deterministik scaffold, görünür öneri ve onaysız submit yok |
| Eksik kanıtın yeşil durum altında kaybolması | Ayrı Proof şeritleri ve insan kararı |
| App Server protokol değişikliği | Versioned schema, capability gate ve native handoff fallback |
| Symphony'nin ürünün önkoşulu olması | Opsiyonel adapter; core akış runner olmadan çalışır |
| Erken extension SDK'nın mimariyi kilitlemesi | MVP internal ports; public SDK yalnız kullanım kanıtı sonrası |

## 17. Kaynaklar

### OpenAI / Codex

- [Codex IDE extension](https://learn.chatgpt.com/docs/codex/ide)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [OpenAI Symphony repository](https://github.com/openai/symphony)

### VS Code ve dağıtım

- [VS Code UX — Views](https://code.visualstudio.com/api/ux-guidelines/views)
- [VS Code contribution points](https://code.visualstudio.com/api/references/contribution-points)
- [VS Code Extension Host and Remote WSL](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [VS Code Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust)
- [Publishing VS Code extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

### GitHub ve kullanıcı ihtiyaçları

- [GitHub Pull Requests and Issues for VS Code](https://github.com/microsoft/vscode-pull-request-github)
- [Codex issue #25792 — long-task context and instructions](https://github.com/openai/codex/issues/25792)
- [Codex issue #4466 — AGENTS.md on Windows/WSL](https://github.com/openai/codex/issues/4466)
- [Codex issue #27740 — installed tool detection](https://github.com/openai/codex/issues/27740)

---

## Son karar

TaskChord'un ayırt edici değeri daha fazla otomasyon katmanı kurmak değil; **ortamı doğru teşhis etmek, işi kalıcı ve anlaşılır bir sözleşmeye dönüştürmek ve sonucu insan kararına kadar kanıtlamaktır.**
