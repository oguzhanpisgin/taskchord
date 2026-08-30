# TaskChord — İlk Kod Öncesi Uygulama ve Onay Planı

**Durum:** 30 Ağustos 2026 tarihinde sahip tarafından onaylandı  
**Kapsam:** Bu belge ilk ürün kodu yazılmadan önceki teknik kararları ve ilk kod dilimini dondurur.  
**Kural:** Onay yalnız aşağıdaki ilk kod dilimi için geçerlidir; sonraki dilimlere otomatik izin vermez.

## 1. Şu ana kadar tamamlananlar

- Yerel depo `C:\Projects\taskchord` altında oluşturuldu.
- Git ana dalı `main` olarak başlatıldı.
- Araştırmaya dayalı ürün planı `docs/PRODUCT-PLAN.md` altına kondu.
- Ürün kimliği donduruldu:
  - TaskChord
  - From issue to reviewed PR
  - `taskchord.taskchord`
  - `taskchord doctor`
  - TaskChord Workbench
  - TaskChord Proof
- Henüz extension, CLI, package, source, test veya workflow kodu yazılmadı.

## 2. İlk koddan önce dondurulacak teknik kararlar

### Ürün sınırı

TaskChord bir Codex veya Symphony alternatifi değildir. TaskChord:

- setup/doctor deneyimini,
- IDE içindeki Issue çalışma yüzeyini,
- Prompt Coach, Goal ve Action Launcher'ı,
- proof sunumunu

sahiplenir; Codex yürütmeyi, Symphony orkestrasyonu, GitHub ise Issue/PR gerçeğini sahiplenir.

### İlk teknoloji seçimi

- Dil: TypeScript, strict mode.
- Çalışma zamanı: implementation başladığı gün desteklenen güncel Node.js LTS sürümü pinlenecek.
- Paket yapısı: pnpm workspace tabanlı monorepo.
- VS Code yüzeyi: native Tree View, commands, walkthrough ve viewsWelcome.
- MVP'de React ve özel dashboard webview yok.
- Paketleme: esbuild.
- Unit test: Vitest.
- Extension integration test: `@vscode/test-electron`.
- Şema doğrulama: JSON Schema tabanlı contracts; runtime doğrulayıcı yalnız ihtiyaç kanıtlandığında seçilecek.
- CLI ve extension aynı doctor core paketini kullanacak.
- Kod biçimlendirme/lint seçimi ilk committe tek araç seti olarak pinlenecek; birbirini tekrarlayan formatter/linter kurulmayacak.

### Repo yapısı — ilk kod onayından sonra

```text
taskchord/
├── apps/
│   ├── vscode-extension/
│   └── doctor-cli/
├── packages/
│   ├── contracts/
│   └── doctor/
├── docs/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── LICENSE
```

Bu ilk dilimde GitHub, Symphony, Codex App Server, Prompt Coach, Goal, Action Launcher ve Proof adapter'ları henüz oluşturulmayacak. Önce ortak temel ve salt-okunur doctor davranışı kanıtlanacak.

## 3. İlk kod dilimi

İlk kod diliminin adı:

> **Slice 001 — Native Workbench shell + read-only Doctor**

### Kullanıcı sonucu

Kullanıcı extension'ı development host içinde açtığında:

1. Activity Bar'da TaskChord görünür.
2. TaskChord Workbench altında Setup, Work ve Proof view'ları görünür.
3. Setup view, çalıştığı ortamı `Windows | WSL | macOS | Linux` olarak gösterir.
4. `Run Doctor` eylemi yalnız salt-okunur environment kontrolü yapar.
5. Aynı kontrol `taskchord doctor --json` ile CLI'dan alınır.
6. Work ve Proof henüz boş durum açıklaması gösterir; sahte veri göstermez.
7. Hiçbir paket kurulmaz, dosya değiştirilmez, process başlatılmaz ve credential okunmaz.

### İlk kodda sahip olunacak dosyalar

- Root workspace/package/TypeScript yapılandırması.
- `packages/contracts`: capability sonucu ve environment türleri.
- `packages/doctor`: yalnız host/environment detection.
- `apps/doctor-cli`: text ve JSON çıktı.
- `apps/vscode-extension`: activation, TaskChord container ve üç native view.
- Unit fixtures: Windows, WSL, macOS ve Linux.
- Extension activation smoke testi.

### İlk kodda özellikle yapılmayacaklar

- GitHub authentication veya Issue yazma.
- Symphony kurma, başlatma veya config üretme.
- Codex App Server başlatma.
- `WORKFLOW.md` oluşturma/değiştirme.
- Promptu modele gönderme.
- Goal senkronu.
- Telemetry.
- Global PATH, shell profili veya kullanıcı config değişikliği.
- Marketplace yayını.
- GitHub remote oluşturma veya push.

## 4. Slice 001 kabul ölçütleri

Aşağıdakilerin tamamı geçmeden ilk dilim tamamlanmış sayılmaz:

- `pnpm install` kilit dosyasını deterministik üretir.
- TypeScript build hatasız geçer.
- Unit testler dört environment fixture'ını geçirir.
- Windows canlı doctor sonucu doğru environment etiketiyle gelir.
- CLI text ve JSON çıktısı aynı contract verisini taşır.
- VS Code extension development host içinde aktive olur.
- TaskChord Workbench'te Setup, Work ve Proof native view'ları görünür.
- Setup view'daki sonuç CLI ile aynı doctor core'dan gelir.
- Untrusted workspace'te doctor okunabilir; gelecekteki write/execute action'ları kayıtlı değildir.
- Test sırasında repo veya kullanıcı config dosyalarında değişiklik yapılmaz.
- Build/test kanıtı exact komut ve exit code ile kaydedilir.
- Aday, yazardan bağımsız bir incelemeden geçer.

## 5. Slice 001 sonrasındaki sıra

Bu sıra şimdilik yön gösterir; Slice 001 onayı başka dilimlere otomatik izin vermez.

1. GitHub authentication + repository discovery.
2. IDE içi New Work ve idempotent Issue draft/create.
3. Deterministic Prompt Coach.
4. Codex App Server capability probe.
5. Goal canonical source + thread projection.
6. Action Launcher.
7. Symphony state/dispatch adapter.
8. TaskChord Proof.
9. Guided installer ve Windows→WSL akışı.
10. Marketplace/Open VSX pre-release.

Her dilim ayrı kabul ölçütüyle başlayacak; bitmemiş temel varken sonraki modüle geçilmeyecek.

## 6. Onay kapısı

Onay verirsen yalnız **Slice 001 — Native Workbench shell + read-only Doctor** uygulanacak.

Onay verilmeden:

- kaynak kod oluşturulmayacak,
- dependency kurulmayacak,
- GitHub'da remote repo açılmayacak,
- commit/push yapılmayacak,
- dış sistemde değişiklik yapılmayacak.

Önerilen onay cümlesi:

> Slice 001'i bu kapsam ve kabul ölçütleriyle uygula.
