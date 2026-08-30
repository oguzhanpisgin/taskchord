# TaskChord — Araştırmaya Dayalı Ürün ve Uygulama Planı

**Ürün:** TaskChord  
**Açıklama:** From issue to reviewed PR  
**Extension ID:** `taskchord.taskchord`  
**CLI:** `taskchord doctor`  
**Ana panel:** TaskChord Workbench  
**Kanıt görünümü:** TaskChord Proof  
**Depo:** Kişisel GitHub hesabında, herkese açık `taskchord` deposu  
**Tarih:** 30 Ağustos 2026  
**Plan durumu:** Uygulamaya hazır ürün kararı; kodlama henüz başlamadı

## 1. Tek cümlelik ürün kararı

**TaskChord, kullanıcının bilgisayarını güvenli biçimde çalışır hâle getiren ve GitHub sitesine gitmeden “iş fikri → doğru görev → Goal → Codex/Symphony çalışması → kanıt → incelenmiş PR” akışını IDE içinde yöneten açık kaynak çalışma katmanıdır.**

TaskChord yeni bir Codex veya yeni bir Symphony yazmaz. Kullanıcının anlamak zorunda kaldığı kurulum, prompt, komut, takip ve kanıt boşluklarını kapatır.

## 2. Araştırmanın gösterdiği gerçek boşluk

Bugün parçaların büyük bölümü ayrı ayrı var:

| Hazır ürün/yüzey | Bugün yaptığı | TaskChord'un kapattığı boşluk |
|---|---|---|
| Codex IDE extension | VS Code, Cursor ve Windsurf içinde bağlamlı sohbet, düzenleme, inceleme ve delegasyon | Bilgisayar/WSL/Symphony/WORKFLOW kurulumu, birleşik iş listesi, görev promptu hazırlama, Issue yaşam döngüsü ve ürün seviyesinde proof |
| Codex App Server | Özel istemciler için kimlik doğrulama, thread, onay, olay akışı, review ve kalıcı thread goal API'leri | Son kullanıcıya yönelik setup, iş modeli ve anlaşılır UI |
| OpenAI Symphony | Tracker'dan işi alır, workspace oluşturur, Codex App Server çalıştırır ve işi sürdürür | Son kullanıcı kurulumu, Windows/WSL köprüsü, prompt yardımı ve IDE-native iş/review yüzeyi |
| GitHub Pull Requests and Issues | VS Code içinde Issue/PR listeleme, Issue ile çalışmaya başlama ve PR inceleme | Codex/Symphony kurulumu ve çalıştırması, Goal, prompt koçluğu, uçtan uca readiness ve proof |
| GitHub coding agents | Issue veya prompttan ajan çalışması ve PR üretimi | Codex/Symphony odaklı yerel kurulum, açık kaynak kişisel çalışma katmanı ve çapraz ortam doctor |

Sonuç: İncelenen resmî ürünlerin hiçbiri tek başına **doctor + güvenli kurulum + prompt hazırlama + goal + Issue/Symphony/Codex + proof + human review** zincirini sunmuyor. TaskChord'un alanı bu bileşimdir; var olan araçların aynısını yeniden yapmak değildir.

## 3. Geçmişte yaşanan sorunların ürün karşılığı

| Yaşanan sorun | Kök neden | TaskChord karşılığı |
|---|---|---|
| Hazır Symphony çözümü geç fark edildi | Kullanıcı mevcut çözümü bilmek zorunda bırakıldı | Doctor önce hazır/uyumlu çözümü tespit eder; özel çözüm tasarlamadan önce kullanıcıya gösterir |
| Windows, WSL, Codex Desktop ve ayrı CLI karıştı | Bir makinede birden fazla çalıştırma ortamı ve sürüm olabilir | Her sonuç `Windows`, `WSL`, `macOS` veya `Linux` ortam etiketi taşır; tek, yanıltıcı “kurulu” işareti yoktur |
| Kurulum başladı ama işin gerçekten çalıştığı kanıtlanmadı | “Binary var” ile “sistem hazır” aynı sayıldı | Readiness ancak uçtan uca kontrollü smoke testten sonra yeşil olur |
| WSL erişim hatası “yok” gibi yorumlanabildi | Bilinmeyen ile başarısız ayrılmadı | Durumlar: Ready / Missing / Needs Permission / Unverified / Failed; bilinmeyen asla yeşil değildir |
| GitHub web, IDE ve Symphony panelleri arasında gidip gelindi | Kullanıcı deneyiminin sahibi yoktu | Workbench, Issue ve PR işlemlerini IDE içinde toplar |
| Kullanıcı doğru promptu kurmakta zorlandı | Boş metin kutusu görev sözleşmesi üretmiyor | Prompt Coach niyeti görev sözleşmesine dönüştürür, eksikleri gösterir ve değişiklikleri onaya sunar |
| `/goal`, `/review`, `/plan`, `/status` gibi komutlar bilinmiyor | Komut adı kullanıcının amacı değildir | Action Launcher, amaçları sade dille listeler; mümkünse kararlı API çağırır, değilse alttaki komutu görünür kılar |
| Build veya paket sonucu “iş bitti” sayıldı | Proof türleri birbirine karıştırıldı | TaskChord Proof canlı ürün, test, commit, PR, CI ve human review kanıtlarını ayrı ayrı gösterir |
| Planlar gereğinden karmaşıklaştı | Teknik katmanlar kullanıcı akışının önüne geçti | Ana ekran yalnızca Setup, Work ve Proof gösterir; ayrıntı ve loglar isteğe bağlı açılır |

## 4. Ürün sınırı

### TaskChord'un sahibi olduğu şeyler

- Ortam tespiti ve salt-okunur `doctor` raporu.
- Kullanıcı onaylı, geri alınabilir kurulum reçeteleri.
- IDE içindeki iş taslağı, Prompt Coach ve Action Launcher deneyimi.
- GitHub Issue'nun TaskChord görünümü ve Issue–run–PR bağlantıları.
- TaskChord Proof'un kanıt şeması ve sunumu.
- Adapter sözleşmeleri ve daha sonra açılacak modül SDK'sı.

### TaskChord'un sahibi olmadığı şeyler

- Codex agent loop'u, model seçimi veya sandbox uygulaması.
- Symphony'nin dispatch/retry/workspace mantığı.
- GitHub Issue ve PR'nin kalıcı gerçekliği.
- Git, CI veya human-review kararının yerine geçmek.
- Codex'in bütün slash komutlarını yeniden uygulamak.

### Tek kaynak kararı

MVP'de Workbench'e giren kalıcı her işin kaynağı **GitHub Issue** olacaktır. Kullanıcı GitHub web sitesine gitmez; TaskChord Issue taslağını IDE içinde oluşturur ve kullanıcı `Oluştur ve Başlat` dediğinde GitHub API üzerinden yayımlar.

Bu ayrım önemlidir:

- **“GitHub Issue açmadan” kullanıcı deneyimi:** Tarayıcıda Issue sayfası açılmaz.
- **Sistem gerçeği:** Arkada kalıcı ve paylaşılabilir bir GitHub Issue oluşturulur.

Yerel, Issue'suz kısa sohbetler normal Codex kullanımında kalır; TaskChord bunları sahte bir ikinci backlog'a dönüştürmez. Daha sonra gerçek ihtiyaç kanıtlanırsa “Taslağı Issue'ya yükselt” akışı eklenebilir.

## 5. Desteklenen IDE ve platformlar

### IDE yüzeyi

| Yüzey | TaskChord durumu | Gerekçe |
|---|---|---|
| Visual Studio Code Desktop | MVP ana hedef | Resmî Extension API, Marketplace ve test altyapısı |
| VS Code + Remote WSL | MVP ana Windows otomasyon hedefi | Symphony'nin hazır Windows binary'si yok; çalışma ortamı WSL olur |
| Cursor | Beta, Open VSX yayını ve ayrı testten sonra | VS Code tabanlıdır fakat Open VSX ve fork davranışı ayrıca doğrulanmalıdır |
| Windsurf | Beta, ayrı uyumluluk testinden sonra | Codex extension uyumlu olsa da TaskChord API uyumu ayrıca kanıtlanmalıdır |
| VS Code Web | Desteklenmez | Yerel process, Git, WSL, Codex ve Symphony kurulumu gerekir |
| Xcode | Aynı eklenti çalışmaz | Codex'in Xcode entegrasyonu farklı yüzeydir |
| JetBrains IDE'leri | Aynı eklenti çalışmaz | Codex'in JetBrains entegrasyonu farklı yüzeydir |
| Codex/ChatGPT Desktop | VSIX otomatik kurulmaz | OpenAI plugin ayrı paket ve yayın yüzeyidir; v1 sonrası ortak çekirdek hedeflenir |

### İşletim sistemi

| Ortam | MVP yaklaşımı |
|---|---|
| macOS arm64/x64 | Yerel doctor; uygun Symphony release'i; yerel Codex/Git/GitHub |
| Linux arm64/x64 | Yerel doctor; uygun Symphony release'i; yerel Codex/Git/GitHub |
| Windows + WSL2 Ubuntu | Windows'ta ön denetim; repo için `Reopen in WSL`; WSL içinde Codex/Git/GitHub/Symphony denetimi ve kurulum |
| Sadece Windows | Workbench ve GitHub yönetimi çalışabilir; tam Symphony otomasyonu WSL kurulana kadar `Needs setup` gösterir |

Windows'ta “tek yeşil durum” kullanılmaz. Örnek:

```text
Windows host       Ready
WSL distribution   Ready
Repo in WSL        Needs action: Reopen in WSL
GitHub auth (Win)  Ready
GitHub auth (WSL)  Missing
Codex (WSL)        Ready
Symphony (WSL)     Ready
```

## 6. TaskChord Workbench bilgi mimarisi

VS Code UX ilkelerine göre tek bir Activity Bar container ve az sayıda native View kullanılacaktır.

```text
┌─ TASKCHORD WORKBENCH ────────────────────────────────┐
│ Ready: 1 repo       Active: 2       Review: 1       │
├─ SETUP ──────────────────────────────────────────────┤
│ ✓ Environment      ✓ GitHub      ✓ Codex            │
│ ! Symphony: WSL authentication needed   [Continue]  │
├─ WORK ───────────────────────────────────────────────┤
│ #241 Checkout timeout       Working       [Goal]    │
│ #242 Login regression       Needs input   [Resolve] │
│ #243 API cleanup            Review        [Proof]   │
│                                                       │
│ [+ New Work]   [Improve Prompt]   [Find an Action]   │
├─ PROOF ──────────────────────────────────────────────┤
│ #243  Tests ✓  CI ✓  Review ✓  Human decision —     │
│                                      [Open Proof]    │
└───────────────────────────────────────────────────────┘
```

### UX kuralları

- Setup, Work ve Proof native Tree View olarak başlar.
- Bir durumda yalnızca bir ana eylem öne çıkarılır.
- Tree item tıklaması körlemesine işlem çalıştırmaz; ayrıntıyı açar.
- Bir item'da üçten fazla inline action olmaz.
- Renk tek durum anlatıcısı değildir; ikon ve metin birlikte kullanılır.
- Klavye, ekran okuyucu, yüksek kontrast ve VS Code tema token'ları desteklenir.
- İlk kurulum `contributes.walkthroughs` ile ilerler; özel webview sihirbazı yapılmaz.
- Boş ekran `viewsWelcome` ile `Check setup` ve `Create first work` eylemlerini gösterir.
- Bildirim yalnız kullanıcı müdahalesi gerektiğinde çıkar; ilerleme panel içinde kalır.
- Webview sadece Prompt Coach fark görünümü veya ileride zengin proof zaman çizelgesi native API ile yapılamazsa kullanılır.

## 7. Birinci ana özellik: Setup Completion

### Doctor ve Installer ayrımı

`taskchord doctor` her zaman salt-okunurdur. Dosya yazmaz, paket kurmaz, servis başlatmaz ve token istemez.

`Review & Fix` akışı ise:

1. Eksik capability'yi açıklar.
2. Hangi ortamda işlem yapılacağını gösterir.
3. Çalışacak komutları ve dosya farkını önceden gösterir.
4. Kullanıcıdan o adım için onay alır.
5. Değişikliği journal'a kaydeder.
6. Sonucu yeniden ölçer.
7. Mümkünse `Undo` üretir.

MVP'de kör `Fix All` yoktur. Bunun yerine **Review & Fix All** vardır: adımlar sıraya alınır ama her yüksek etkili işlem ayrıca onaylanır.

### Capability denetimleri

```text
Host
├── OS / architecture / shell
├── VS Code host location: local | remote WSL | container
├── Workspace Trust
└── filesystem and network constraints

Repository
├── Git repository and remote
├── clean/dirty state — yalnız bilgi, otomatik temizleme yok
├── GitHub repository access
└── issue templates / required metadata

Codex
├── executable resolution and version
├── authentication state without reading secrets
├── app-server startup + initialize handshake
├── goal capability probe
└── approval/sandbox requirements

Symphony
├── binary/source installation
├── supported target and checksum
├── WORKFLOW.md parse and effective config
├── configured GitHub adapter
├── process/API health
└── controlled refresh/state read

Delivery
├── issue create/read capability
├── test task dispatch capability
├── Codex/Symphony run observation
├── proof collection
└── review handoff
```

### “Kurulum tamamlandı” kabul ölçütü

Sadece programların bulunması yeterli değildir. Tam kurulum şu altı aşamanın kanıtıyla biter:

1. **Environment:** Doğru execution environment doğrulandı.
2. **Accounts:** GitHub ve Codex oturumları gerçekten kullanılabilir.
3. **Tools:** Git, Codex App Server ve gerekiyorsa Symphony çalışıyor.
4. **Workflow:** `WORKFLOW.md` parse oluyor ve repo/izin sınırları doğru.
5. **Integration:** TaskChord, GitHub ve Symphony state'ini okuyabiliyor.
6. **First Run:** Kullanıcı onaylı deneme işi uçtan uca review-ready çıktıya veya açık bir kontrollü hata sonucuna ulaşıyor.

Deneme Issue oluşturmak dış etki olduğu için kullanıcıdan önce açık onay alınır; deneme içeriği ve temizleme davranışı gösterilir.

## 8. İkinci ana özellik: IDE içinden Issue işi

### New Work akışı

1. Kullanıcı `New Work` düğmesine basar.
2. TaskChord repo ve mevcut editor bağlamını gösterir.
3. Kullanıcı bug, feature, investigate, refactor, test, docs veya setup türünü seçer.
4. Prompt Coach görevi tamamlar.
5. Oluşacak GitHub Issue başlığı, gövdesi, label'ları ve otomasyon etkisi önizlenir.
6. Kullanıcı `Create`, `Create and Start` veya `Save Draft` seçer.
7. GitHub Issue idempotency anahtarıyla bir kez oluşturulur.
8. `Create and Start` seçildiyse gerekli dispatch label/state uygulanır; Symphony işi alır.
9. Workbench Issue → run → PR ilişkisinin durumunu gösterir.

### Desteklenen işlemler

- Issue oluşturma, görüntüleme ve güncelleme.
- Label, assignee ve milestone seçimi; repo yetkileri izin verdiği kadar.
- Comment ekleme ve agent'a yeni bilgi gönderme.
- Blocked nedenini görüntüleme ve kullanıcı yanıtını ekleme.
- PR'yi açma, diff/check/review durumunu görme.
- Human review kararı: `Request changes`, `Accept`, `Open on GitHub`.
- Merge işlemi MVP'de ayrı ve açık kullanıcı onayı ister; otomatik merge yoktur.

Issue template veya form varsa TaskChord bunu atlamaz. Desteklenmeyen required alan varsa kullanıcıyı GitHub'a yönlendirmek yerine mümkün olduğu ölçüde native form alanı gösterir; mümkün değilse açıkça `This field must be completed on GitHub` der.

## 9. Prompt Coach

Prompt Coach eklenti değil, TaskChord'un ana ürün özelliklerinden biridir. Araştırma, kullanıcıların özellikle niyeti doğru soyutlama düzeyinde ifade etmekte, bağlam vermekte ve sonucu doğrulamakta zorlandığını gösteriyor. Bu yüzden kullanıcıya yalnız büyük bir metin kutusu vermek yeterli değildir.

### Prompt sözleşmesi

Her iş şu alanlardan ihtiyaç duyduklarını kullanır:

```text
Outcome        Ne değişmeli veya hangi sonuç üretilmeli?
Context        Hangi repo, dosya, hata, ekran veya karar önemli?
Reproduction   Hata nasıl tekrar edilir?
Boundaries     Ne değişmemeli; hangi işlem önce izin istemeli?
Acceptance     İyi sonuç nasıl anlaşılır?
Verification   Hangi test, komut veya gözlem kanıt sayılır?
Output         PR, rapor, patch veya açıklama mı bekleniyor?
```

### Kullanıcı deneyimi

- Kullanıcı normal cümlesini yazar; zorunlu form doldurmak zorunda değildir.
- Coach eksik alanları `Missing context`, `No verification`, `Scope may be broad` gibi anlaşılır uyarılarla gösterir.
- Editor selection, açık dosyalar, Problems paneli, test hataları, Git diff ve terminal çıktısı yalnız kullanıcı seçerse eklenir.
- `Improve` sonucu özgün metnin üzerine sessizce yazılmaz.
- Önce/sonra farkı gösterilir; her ekleme tek tek kabul veya reddedilebilir.
- “Neden eklendi?” açıklaması vardır.
- Son söz daima kullanıcıdadır; onaysız Issue veya Codex turn başlatılmaz.

### MVP uygulaması

MVP iki katmanlıdır:

1. **Deterministic Coach:** Görev türü şablonları, eksik alan tespiti ve kapsam/verification kuralları. Token harcamaz, kod göndermeden çalışır.
2. **Optional AI Improve:** Kullanıcı açıkça isterse mevcut Codex oturumuyla prompt iyileştirme önerisi üretir. Gönderilecek bağlam önceden gösterilir ve sonuç fark görünümüne gelir.

“Prompt quality 83/100” gibi sahte kesinlik kullanılmaz. Bunun yerine somut hazır olma işaretleri gösterilir:

```text
Outcome       Ready
Context       2 files attached
Boundaries    Missing
Acceptance    Ready
Verification  Needs one check
```

## 10. Goal düğmesi

Her Work item'da görünür bir `Goal` düğmesi olacaktır.

### Goal kaynağı

TaskChord iş Goal'ünün kalıcı kaynağı GitHub Issue içindeki görünür `Goal` bölümü ve sürümlü TaskChord metadata marker'ıdır. Böylece Symphony yeni thread açsa bile Goal kaybolmaz.

Codex thread goal ise bu iş Goal'ünün çalışma anındaki izdüşümüdür:

```text
GitHub Issue Goal (canonical)
            ↓
Symphony task prompt
            ↓
Codex thread/goal/set (thread erişilebiliyorsa)
```

### Düğme davranışı

- `Set Goal`: Coach, Issue'dan kısa bir amaç önerir; kullanıcı düzenler ve onaylar.
- `View Goal`: Amaç, durum ve bağlı run/thread'leri gösterir.
- `Edit / Pause / Resume / Clear`: TaskChord canonical Goal'ü günceller; bağlı Codex thread varsa App Server API ile eşler.
- TaskChord ile `/goal` farklılaşırsa sessiz merge yapılmaz. `Goal differs in Codex` uyarısı ve `Use Issue goal` / `Use Codex goal` seçenekleri çıkar.
- App Server'ın goal API'si capability probe ile doğrulanmadan çağrılmaz.
- 4.000 karakter App Server sınırı korunur; uzun ayrıntılar Issue gövdesinde kalır, Goal kısa amaçtır.

Symphony'nin mevcut public state'i thread kimliğini vermiyorsa Goal butonu yine Issue seviyesinde çalışır; native Codex goal senkronu `Not connected to a Codex thread` olarak açıkça gösterilir. Bu durum başarı gibi sunulmaz.

## 11. Slash Command Assistant: TaskChord Action Launcher

Kullanıcıların komut adlarını ezberlemesi beklenmez. Workbench'teki `Find an Action` şu amaçlarla açılır:

| Kullanıcı amacı | TaskChord eylemi | Alt mekanizma |
|---|---|---|
| “Bu işin hedefini sabitle” | Set Goal | Issue Goal + varsa App Server goal API |
| “Önce plan çıkar” | Plan this work | Kararlı API varsa çağrı; yoksa Codex'i açıp hazırlanmış `/plan` metnini gösterme |
| “Değişiklikleri incele” | Review changes | App Server `review/start` veya mevcut Codex review yüzeyi |
| “Nerede kaldı?” | Show status | TaskChord state + Symphony API + GitHub checks |
| “Bağlam küçüldü” | Manage context | Desteklenen Codex action; alttaki komut görünür |
| “İzinleri değiştir” | Review permissions | Mevcut effective policy'yi göster; değişiklik öncesi etkisini açıkla |
| “Bir dosyayı ekle” | Add editor context | VS Code selection/file context |
| “Takıldım” | Diagnose blocker | Logları sınıflandır; önerilen tek sonraki adımı göster |

Kurallar:

- Her action sade açıklama, etki alanı ve gerekli izni gösterir.
- Altta kullanılan `/goal`, `/review` veya diğer komut gizlenmez; öğretici biçimde görünürdür.
- Codex extension command ID'leri kararlı API kabul edilmez.
- Başlangıçta capability probe yapılır; bulunmayan action disable edilir ve alternatif yol sunulur.
- Slash catalog TaskChord release'ine körlemesine sabitlenmez; Codex uyumluluk matrisiyle sürümlenir.
- Önerilen sonraki action otomatik çalışmaz.

## 12. TaskChord Proof

Proof görünümü “agent bitti dedi” bilgisini değil, ayrı kanıt şeritlerini gösterir.

```text
Task contract     Issue #243 + Goal + accepted prompt version
Environment       OS/WSL/tool versions + workflow digest
Execution         Symphony run + Codex thread/run references
Changes           branch + commit + diff summary
Validation        exact commands, exit codes, relevant test results
CI                workflow/check names + current SHA + result
Review            findings + resolution state + reviewer provenance
Human decision    pending | changes requested | accepted
Delivery          PR URL + merge state + target branch
```

Durumlar:

- `Evidence missing`: kanıt üretilmedi.
- `Failed`: kanıt var ve başarısız.
- `Passed`: o tek şerit geçti.
- `Not applicable`: gerekçesiyle kapsam dışı.
- `Ready for human review`: gerekli şeritler geçti; insan kararı bekleniyor.
- `Accepted`: insan kabul etti.

Build geçmesi ürünün çalıştığını veya PR'nin kabul edildiğini kanıtlamaz. TaskChord bu şeritleri tek “green” rozetine erken birleştirmez.

MVP'de Proof native Tree View ve açılabilir Markdown/virtual document ile sunulur. Zengin zaman çizelgesi ancak kullanıcı testi bunun gerekli olduğunu gösterirse webview olur.

## 13. Mimari

```text
VS Code / Cursor / Windsurf
└── TaskChord Extension
    ├── Workbench Views
    ├── Prompt Coach
    ├── Action Launcher
    ├── Goal Service
    ├── Proof Projector
    └── Capability Router
          │
          ├── Doctor Core ── Recipe Providers
          ├── GitHub Adapter ── Issues / PR / Checks
          ├── Symphony Adapter ── state / refresh / process health
          ├── Codex Adapter ── app-server initialize / goal / review / events
          ├── Git Adapter
          └── Secret Store Adapter

External truth
├── GitHub Issue / PR / CI
├── Symphony + WORKFLOW.md
├── Codex App Server
└── Local/WSL Git workspaces
```

### Önerilen monorepo

```text
taskchord/
├── apps/
│   ├── vscode-extension/
│   └── doctor-cli/
├── packages/
│   ├── contracts/
│   ├── core/
│   ├── doctor/
│   ├── prompt-coach/
│   ├── goal-service/
│   ├── action-catalog/
│   ├── proof/
│   ├── adapter-github/
│   ├── adapter-symphony/
│   ├── adapter-codex/
│   └── adapter-git/
├── recipes/
│   ├── windows-wsl/
│   ├── macos/
│   └── linux/
├── schemas/
├── docs/
└── .github/workflows/
```

Doctor CLI ile extension aynı `doctor` çekirdeğini kullanır. CLI ayrı davranış icat etmez.

### Temel sözleşmeler

```ts
interface CapabilityCheck {
  id: string;
  environment: "windows" | "wsl" | "macos" | "linux";
  status: "ready" | "missing" | "needs_permission" | "unverified" | "failed";
  evidence: EvidenceRef[];
  remediation?: RemediationPlan;
}

interface WorkItem {
  provider: "github";
  repository: string;
  issueNumber: number;
  goal?: TaskGoal;
  promptVersion: string;
  status: "draft" | "queued" | "working" | "blocked" | "review" | "done";
  runRefs: RunRef[];
  pullRequest?: PullRequestRef;
}

interface TaskChordModule {
  manifest: ModuleManifest;
  checks?: CapabilityCheckProvider[];
  actions?: ActionProvider[];
  proofCollectors?: ProofCollector[];
}
```

Public Module SDK MVP'de yayımlanmaz. Önce TaskChord'un kendi GitHub, Codex, Symphony ve proof modülleri aynı internal portları kullanır; v1'de gerçek kullanım şekillerinden kararlı SDK çıkarılır.

## 14. Adapter kararları

### GitHub adapter

- MVP'de tek tracker GitHub Issues'dır.
- VS Code'un GitHub authentication provider'ı varsa açık kullanıcı onayıyla kullanılır.
- Cursor/Windsurf'te provider yoksa token yapıştırma istenmez; `gh` device/browser authentication veya açık yönlendirme kullanılır.
- Windows ve WSL GitHub oturumları ayrı ayrı doğrulanır.
- Issue oluşturma retry'larında TaskChord idempotency marker kullanır.
- Issue form/template ve repo izinleri discovery ile okunur.
- Token değerleri loglanmaz veya workspace'e yazılmaz.

### Symphony adapter

- GitHub Issue dispatch için Symphony'nin belgelenmiş GitHub adapter'ı kullanılır.
- TaskChord scheduler olmaz; Issue'ya dispatch metadata yazar ve Symphony state API'sini okur.
- Symphony engineering preview olduğu için her başlangıçta sürüm/capability kontrolü yapılır.
- Windows'ta hazır binary olmadığı için tam otomasyon Remote WSL'de çalışır.
- Symphony yoksa Workbench, Prompt Coach, Issue ve Proof özellikleri çalışmaya devam eder; otomasyon `Manual Codex handoff` seviyesine düşer.

### Codex adapter

- Derin entegrasyon için `codex app-server` ve varsayılan stdio JSONL transport kullanılır.
- Başlangıçta `initialize` ve capability negotiation yapılır.
- Goal için `thread/goal/set|get|clear`, review için belgelenmiş API kullanılır.
- App Server onay istekleri TaskChord tarafından sessizce kabul edilmez.
- WebSocket deneysel olduğu için MVP production transport değildir.
- Codex extension'ın özel/internal API'sine bağımlılık kurulmaz.

### WORKFLOW adapter

- Mevcut `WORKFLOW.md` asla sessizce üzerine yazılmaz.
- TaskChord, parse edilmiş config ve üreteceği farkı gösterir.
- Yeni dosya repo ve güvenlik politikasına göre kullanıcı onayıyla oluşturulur.
- Secret doğrudan dosyaya yazılmaz; environment/secret-store referansı kullanılır.
- Değişiklik sonrası Symphony reload sonucu ve effective config yeniden doğrulanır.

## 15. Güvenlik ve izin modeli

### Temel ilkeler

- Workspace Trust verilmeden process çalıştırma, repo config yazma veya hook çalıştırma yoktur.
- Read-only doctor, write yapan installer'dan ayrı tutulur.
- Her mutasyon: hedef, neden, komut/fark, geri alma ve sonuç kaydı taşır.
- Elevation yalnız gerçekten gerektiğinde, işlemden hemen önce istenir.
- Shell profili ve global PATH, MVP'de varsayılan olarak değiştirilmez.
- Kullanıcının mevcut Codex config'i birleştirme önizlemesi olmadan değiştirilmez.
- Repo dirty ise TaskChord bunu korur; reset, checkout veya cleanup yapmaz.
- GitHub/WSL/Codex credential'ları kopyalanmaz; her ortam kendi auth mekanizmasını kullanır.
- Prompt Coach hangi dosya ve metni Codex'e göndereceğini gösterir.
- Telemetry MVP'de kapalıdır. İleride opt-in olursa prompt, kod, path, token veya log gövdesi gönderilmez.

### İzin seviyeleri

```text
Observe     Setup/work/proof oku
Prepare     Prompt ve Issue taslağı hazırla
Write       Onaylı Issue/comment/config farkını uygula
Execute     Codex/Symphony sürecini başlat
Publish     PR/merge gibi dış etkileri ayrı onayla
```

Her adapter ihtiyacı kadar izin ister. `Execute` izni `Publish` yetkisi vermez.

## 16. Repo, lisans ve yayın kararı

### Kişisel hesap

İlk depo kişisel hesapta olmalıdır:

```text
github.com/<kişisel-kullanıcı-adı>/taskchord
```

Maginory altında başlamamalıdır. TaskChord bağımsız açık kaynak ürün ve farklı yaşam döngüsüdür. İleride topluluk veya ekip oluşursa GitHub organization'a kontrollü transfer yapılabilir.

### Kimlik rezervasyonu

- GitHub repo adı: `taskchord`
- VS Code publisher ID: `taskchord`
- VS Code extension name: `taskchord`
- Tam extension ID: `taskchord.taskchord`
- Open VSX namespace: `taskchord`
- npm/CLI package adı: uygunluk kontrolünden sonra `taskchord` veya `@taskchord/cli`

Publisher/namespace adlarının gerçekten boş olduğu yayın öncesi canlı kontrol edilmelidir. Kimlik boşsa önce rezervasyon yapılır; ürün adı değiştirilmez, yalnız publisher kimliği için kontrollü alternatif değerlendirilir.

### Lisans

Öneri: **Apache-2.0**. Açık kaynak kullanım ve katkıya izin verir, patent lisansını açıkça düzenler ve Symphony'nin lisans ailesiyle uyumludur. Üçüncü taraf kod kopyalanırsa NOTICE ve lisans yükümlülükleri ayrıca izlenir.

### Dağıtım

1. GitHub Releases: kaynak, checksum, VSIX ve SBOM.
2. Visual Studio Marketplace: `vsce` ile `taskchord.taskchord`.
3. Open VSX: aynı extension ID ve aynı build artifact digest'i.
4. VS Code pre-release kanalında kapalı beta.
5. Stable yayın yalnız Windows/WSL, macOS ve Linux test matrisi geçince.

VS Code Marketplace ve Open VSX ayrı registries'tir. Birine yayınlamak diğerinde görünürlük sağlamaz. Cursor şu anda üçüncü taraf uzantılar için Open VSX kullanır; bu nedenle çift yayın ürün gereksinimidir.

## 17. MVP → v1 yol haritası

### MVP — tek repo, GitHub, kontrollü otomasyon

MVP'de mutlaka olacaklar:

1. **Doctor:** Windows/WSL/macOS/Linux detection ve evidence-based readiness.
2. **Guided setup:** Git, GitHub auth, Codex App Server, Symphony ve `WORKFLOW.md` için önizlemeli reçeteler.
3. **Workbench:** Setup, Work ve Proof native views.
4. **New Work:** IDE içinde GitHub Issue taslağı, oluşturma ve başlatma.
5. **Prompt Coach v1:** Deterministic contract + optional AI Improve diff.
6. **Goal button:** Issue-level canonical Goal ve mümkünse App Server goal sync.
7. **Action Launcher:** En az Goal, Plan, Review, Status, Permissions ve Diagnose.
8. **Symphony adapter:** GitHub dispatch ve state/blocked takibi.
9. **TaskChord Proof:** Issue, run, test, CI, PR ve human-review şeritleri.
10. **Release:** VSIX, VS Marketplace pre-release ve Open VSX pre-release.

MVP'de olmayacaklar:

- Jira, Linear, Asana ve GitLab tracker'ları.
- Otomatik merge veya onaysız publish.
- Organizasyon çapında çoklu repo dashboard'u.
- Public modül SDK'sı.
- Xcode veya JetBrains eklentisi.
- Codex/ChatGPT Desktop plugin'i.
- Symphony'nin yerine yeni orchestrator.
- Web dashboard ve ayrı bulut servisi.

### v1 — güvenilir genel yayın

- Gerçek kullanıcı ortamlarından sertleştirilmiş, undo destekli installer.
- Internal modüllerden çıkarılmış versioned Module SDK.
- Ek proof collector'lar: browser, security, release, deployment.
- Birden fazla repo ve filtrelenebilir Workbench.
- Cursor ve Windsurf için resmî beta destek matrisi.
- Signed/checksummed recipe catalog ve supply-chain policy.
- Localization: Türkçe ve İngilizce.
- Accessibility audit ve performans budget'ı.
- Stable VS Marketplace + Open VSX yayını.

### v1 sonrası

- OpenAI universal plugin: TaskChord durumunu Codex/ChatGPT yüzeyinden sorgulama ve sınırlı eylemler.
- Symphony'nin diğer tracker adapter'ları üzerinden Jira/Linear/Asana/GitLab.
- Kurumsal policy pack ve özel registry.
- Uzaktan çalışan Symphony host'ları.
- Topluluk modülleri ve imzalı module registry.

## 18. İlk uygulama backlog'u

| Sıra | İş | Bitmiş sayılma ölçütü |
|---:|---|---|
| 1 | Repo ve ürün iskeleti | Kişisel public repo, lisans, contribution, threat model ve CI çalışıyor |
| 2 | Contracts + doctor core | Dört OS/ortam modeli ve structured status sözleşmeleri testli |
| 3 | VS Code native shell | Activity Bar container, Setup/Work/Proof views ve walkthrough çalışıyor |
| 4 | GitHub adapter | Auth, repo discovery, Issue draft/create/read/update ve idempotency testli |
| 5 | Prompt Coach | Yedi task template, eksik alan tespiti, context picker ve diff approval testli |
| 6 | Codex app-server client | Initialize, capability probe, goal ve review akışları fixture + integration testli |
| 7 | Goal service | Issue canonical goal, thread projection ve divergence çözümü testli |
| 8 | Action Launcher | Capability-aware action catalog ve fallback davranışı testli |
| 9 | Symphony adapter | State/refresh/blocked mapping ve GitHub dispatch akışı testli |
| 10 | Guided installer | macOS/Linux ve Windows→WSL reçeteleri preview/journal/undo ile testli |
| 11 | Proof projector | Ayrı kanıt şeritleri ve review-ready hesaplaması testli |
| 12 | E2E | Gerçek test reposunda New Work → Issue → run → PR → human review kanıtı |
| 13 | Cross-platform QA | Windows+WSL, macOS ve Linux fixture + canlı smoke test |
| 14 | Pre-release | Aynı digest VS Marketplace ve Open VSX'te, install/upgrade/rollback doğrulanmış |

## 19. Ürün kabul ölçütleri

MVP şu senaryoların tümü kanıtlanmadan hazır sayılmaz:

- Temiz macOS/Linux makinede kullanıcı doküman okumadan kurulumu tamamlayabiliyor.
- Windows kullanıcısı hangi parçanın Windows'ta, hangisinin WSL'de olduğunu anlayabiliyor ve repo doğru ortamda açılıyor.
- Mevcut Codex config ve `WORKFLOW.md` korunuyor; uygulanacak fark önceden görülüyor.
- Kullanıcı GitHub web sitesini açmadan doğru alanlara sahip bir Issue oluşturabiliyor.
- Aynı işlem retry olduğunda duplicate Issue oluşmuyor.
- Prompt Coach kullanıcının niyetini değiştirmeden eksik scope/acceptance/verification noktalarını görünür kılıyor.
- Goal edit edildiğinde Issue kaynağı ve bağlı Codex thread durumu açıkça eşleşiyor veya fark görünür oluyor.
- Kullanıcı slash komut adı bilmeden plan, goal, review ve status eylemlerini bulabiliyor.
- Symphony yok veya uyumsuz olduğunda ürün çökmüyor; hangi otomasyonun kullanılamadığı açıkça gösteriliyor.
- Proof, test başarısı ile human acceptance'ı ayrı gösteriyor.
- Untrusted workspace'te yazma ve process çalıştırma özellikleri kapalı.
- Extension kaldırıldığında kullanıcı reposu, Git config'i ve credential'ları bozulmuyor.

## 20. Başlıca ürün riskleri ve alınan kararlar

| Risk | Karar |
|---|---|
| Symphony preview değişiklikleri | Capability probe, destek matrisi ve graceful degradation |
| Windows–WSL iki ortam karmaşası | Her check'e environment etiketi; tam otomasyon için Reopen in WSL |
| Goal'un Issue ve Codex thread arasında ayrışması | Issue canonical; divergence görünür ve kullanıcı çözer |
| Slash komut semantiğinin değişmesi | Özel extension API'ye bağlanma yok; kararlı App Server API + açık fallback |
| Installer'ın fazla yetkili olması | Doctor read-only; preview, per-step consent, journal ve undo |
| Kötü prompt coach'un niyeti bozması | Deterministic rubric, diff approval, onaysız submit yok |
| Duplicate Issue ve webhook yan etkileri | Idempotency marker ve read-after-write doğrulama |
| Cursor/Windsurf uyumluluğunun varsayılması | Open VSX ayrı yayın ve fork başına test; başlangıçta beta etiketi |
| Proof'un sahte güven üretmesi | Kanıt şeritleri ayrı; missing/failed/passed ayrımı |
| Erken public SDK'nın mimariyi kilitlemesi | MVP internal ports; public SDK v1'de gerçek kullanım sonrası |

## 21. Kaynaklar

### OpenAI / Codex / Symphony

- [Codex IDE extension](https://learn.chatgpt.com/docs/codex/ide)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex developer and slash commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
- [OpenAI prompting guidance](https://learn.chatgpt.com/docs/prompting)
- [OpenAI Symphony repository](https://github.com/openai/symphony)
- [Symphony Elixir reference implementation](https://github.com/openai/symphony/blob/main/elixir/README.md)
- [Symphony releases](https://github.com/openai/symphony/releases)

### VS Code ve dağıtım

- [VS Code UX — Views](https://code.visualstudio.com/api/ux-guidelines/views)
- [VS Code UX — Webviews](https://code.visualstudio.com/api/ux-guidelines/webviews)
- [VS Code UX — Notifications](https://code.visualstudio.com/api/ux-guidelines/notifications)
- [VS Code contribution points and walkthroughs](https://code.visualstudio.com/api/references/contribution-points)
- [VS Code Extension Host and Remote WSL](https://code.visualstudio.com/api/advanced-topics/extension-host)
- [VS Code Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust)
- [Publishing VS Code extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Cursor extension registry behavior](https://prod.cursor.com/help/customization/extensions)

### GitHub ve mevcut IDE akışları

- [GitHub Pull Requests and Issues for VS Code](https://github.com/microsoft/vscode-pull-request-github)
- [GitHub Issue features in VS Code](https://github.com/microsoft/vscode-pull-request-github/blob/main/documentation/IssueFeatures.md)
- [GitHub coding agents](https://docs.github.com/en/copilot/concepts/agents/about-third-party-coding-agents)
- [GitHub agent-task prompt best practices](https://docs.github.com/en/copilot/using-github-copilot/using-copilot-coding-agent-to-work-on-tasks/best-practices-for-using-copilot-to-work-on-tasks)

### Prompt kullanılabilirliği araştırması

- [PromptAid: Prompt Exploration, Perturbation, Testing and Iteration](https://arxiv.org/abs/2304.01964)
- [What It Wants Me To Say: Bridging the Abstraction Gap](https://www.microsoft.com/en-us/research/publication/what-it-wants-me-to-say-bridging-the-abstraction-gap-between-end-user-programmers-and-code-generating-large-language-models/)
- [Dynamic Prompt Middleware](https://www.microsoft.com/en-us/research/publication/dynamic-prompt-middleware-contextual-prompt-refinement-controls-for-comprehension-tasks/)

---

## Son karar özeti

TaskChord'un ilk ürünü **tek bir VS Code eklentisi + aynı çekirdeği kullanan doctor CLI** olacaktır. GitHub Issue kalıcı kaynak, Symphony otomasyon motoru, Codex App Server çalışma arayüzü, TaskChord ise kullanıcı deneyiminin sahibidir.

Ürünün ayırt edici dörtlüsü:

1. **Kurulumu gerçekten bitiren Setup Completion**
2. **GitHub web sitesine gitmeden Issue→PR çalışma yüzeyi**
3. **Prompt Coach + Goal**
4. **Slash komut ezberi yerine Action Launcher + güvenilir Proof**

Bu sınır, TaskChord'u yalnız Symphony installer'ı veya başka bir GitHub Issues paneli olmaktan çıkarır; yaşadığımız gerçek sorunlardan doğan, tek bir açık kaynak ürüne dönüştürür.


