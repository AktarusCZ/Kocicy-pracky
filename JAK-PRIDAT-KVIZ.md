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

Editor načítá členy týmu přímo z karet v index.html. Účastníky vybíráš zaškrtáváním. Jejich počet se počítá automaticky ze seznamu members, nemusíš ho zadávat zvlášť. Z výběru se aktualizují i počty účastí a medaile na kartách členů týmu. Při přidání dalšího člena do týmu se automaticky objeví ve formuláři.

U historických kvízů je totalTeams zatím null a league prázdná, protože tyto informace nebyly ve starých datech. Web je zobrazí jako neuvedené. Doplň je podle skutečných výsledků v events.json.
