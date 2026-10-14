# Přidávání kvízů

Všechna data jsou v `events.json`. Web z nich automaticky vytváří Události, Kvízy podle roku, účastníky a roční součty bodů.

## Přímo na GitHubu

Otevři `events.json`, zvol úpravu a přidej na začátek seznamu nový záznam podle vzoru:

```json
{
  "quizName": "NÁZEV KVÍZU",
  "date": "14.10.2026",
  "points": 35.5,
  "position": 4,
  "totalTeams": 22,
  "league": "Podzimní liga 2026",
  "members": ["Honza", "Simca", "Terka"],
  "description": "Krátký popis večera.",
  "photos": ["07.jpg"]
},
```

Záznam vlož za úvodní `[` před první existující kvíz. Mezi záznamy musí být čárka; za posledním záznamem čárka není. Body s desetinnou částí zapisuj tečkou. Bez popisu použij `"description": ""`, bez fotografií `"photos": []`, bez účastníků `"members": []`.

Fotografie mohou být adresy URL nebo cesty k obrázkům v projektu (např. `07.jpg` nebo `assets/kviz.jpg`). Novou fotografii nejprve nahraj do repozitáře. Datum určuje pořadí a rok; pořadí záznamů v souboru není podstatné.

Ulož změnu commitem. Po zveřejnění změn GitHub Pages se všechny přehledy aktualizují při načtení stránky. `index.html` neupravuj.

## Pomocí formuláře

Otevři `editor.html` na svém webu. Načte současný `events.json`. Vyplň kvíz včetně účastníků a klikni na **Přidat kvíz**. Můžeš přidat více kvízů za sebou. Poté klikni na **Stáhnout celý events.json** a staženým souborem nahraď `events.json` na GitHubu.

Editor uchovává i všechny stávající záznamy. Sám na GitHub nic neodesílá a rozepsaná data neuchovává po zavření nebo obnovení stránky. Používej ho na webu nebo přes místní HTTP server, protože otevření přes `file://` neumožňuje načtení JSON ve většině prohlížečů.

## Sjednocení starších dat

Do společného souboru byli doplněni účastníci a kvízy LEGENDÁRNÍ MEME, SERIÁLOVÉ ZNĚLKY a JAK JSEM POZNAL VAŠI MATKU. Název FILMONÉ ZNĚLKY byl sjednocen s FILMOVÉ ZNĚLKY z 31.3.2026. COVER SONGY mělo v událostech 13. místo a v přehledu 16. místo; společný záznam používá 13. místo z původního events.json. Případnou opravu udělej jen tam.

## Umístění, účastníci a liga

`position` je naše umístění a `totalTeams` celkový počet týmů (např. 11 z 22). `league` je název konkrétní ligy / sezóny, např. Jarní liga 2026 nebo Podzimní liga 2026. Názvy zapisuj jednotně; editor nabízí již použité ligy a dovoluje zadat novou.

Editor i web načítají členy týmu ze souboru members.json. Účastníky vybíráš zaškrtáváním. Jejich počet se počítá automaticky ze seznamu members, nemusíš ho zadávat zvlášť. Z výběru se aktualizují i počty účastí a medaile na kartách členů týmu. Při přidání dalšího člena do members.json se automaticky objeví na webu i ve formuláři.

U historických kvízů je totalTeams zatím null a league prázdná, protože tyto informace nebyly ve starých datech. Web je zobrazí jako neuvedené. Doplň je podle skutečných výsledků v events.json.

## Správa členů

Upravuj pouze `members.json`. Každý člen má stálé `id` (používá se v seznamu účastníků kvízu), zobrazované `name` a volitelnou ikonu `icon`.

```json
{
  "id": "NovyClen",
  "name": "Nový člen",
  "icon": "🐾"
}
```

Pro přidání vlož záznam do seznamu a odděl jej čárkou od ostatních. Pro odebrání odstraň celý záznam a uprav čárky tak, aby JSON zůstal platný. ID musí být jedinečné a po účasti na kvízech ho neměň; zobrazované jméno měnit můžeš. Pořadí v souboru určuje pořadí členů na webu i v editoru. Prázdný seznam `[]` je také platný.

Odebraný člen zmizí z karet týmu i z nabídky pro nové kvízy. Jeho účast ve starších kvízech zůstane zachovaná. V historických seznamech účastníků se používají původní ID.

V **Událostech** se zobrazují pouze kvízy s neprázdným popisem nebo alespoň jednou neprázdnou cestou k fotografii. Prázdné texty a mezery nestačí. V sekci **Kvízy**, v součtech bodů a počtech účastí se nadále započítávají všechny kvízy.

## Nový vzhled webu

Web má samostatné soubory `css/site.css` a `js/site.js`, úvodní obrázek `assets/hero-pub.png` a jemný vzorek `assets/paw-pattern.svg`. Při nahrávání na GitHub přenes také tyto soubory spolu s index.html. Herní stránky a jejich soubory zůstávají zachované.

Statistiky v úvodu se počítají ze všech kvízů. Tým zobrazuje vlastní zlaté tlapky a počet účastí; tři nejaktivnější současní členové mají odznak. Sekce Události nabízí dva nejnovější kvízy s popisem či fotkou a tlačítko pro zobrazení všech. Fotografie se otevírají kliknutím. V přehledu lze vybrat rok a ligu, účastníky rozbalit a zobrazit součet odpovídající vybraným filtrům. Výchozí přehled zobrazuje všechny roky, každý s vlastními ligami.

Jména v seznamu účastníků se převádějí z ID na zobrazovaná jména podle members.json. U odebraných členů zůstane původní ID. Ligu v dolním panelu určuje nejnovější kvíz s vyplněnou ligou; odkaz na tabulku a Facebook zůstává původní a upravuje se v index.html.

Úvodní obrázek byl vytvořen vestavěným imagegen: tmavá česká hospoda, kočka vlevo, pivo vpravo, prázdný střed pro text, černá a teplá zlatá paleta, bez textu a log.

## Přehled podle roku a ligy

Kvízy se zobrazují v samostatných skupinách: **rok → liga → kvízy**. Pod každou ligou je její celkový součet bodů. Filtr roku nebo ligy mění viditelné kvízy, nikoli celkový počet bodů dané pojmenované ligy. Pokud jedna liga zasahuje do více roků, její součet zahrnuje celý průběh ligy. Pro různé sezóny používej rozdílné názvy včetně roku, například PODZIMNÍ LIGA ROCKLE 2026 a JARNÍ LIGA ROCKLE 2027.

Záznamy bez ligy jsou samostatně pod Liga neuvedena a sčítají se pouze v rámci daného roku. Žádné roční součty všech lig se v přehledu nevypisují.
