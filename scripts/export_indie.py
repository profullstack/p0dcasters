import sqlite3, os, re, math, time, unicodedata

SRC="/home/anthony/p0dcasters-data/p0dcasters_live.db"
DST="/home/anthony/p0dcasters-data/p0dcasters.db"
NOW=int(time.time()); D=86400
if os.path.exists(DST): os.remove(DST)

src=sqlite3.connect(f"file:{SRC}?mode=ro",uri=True)
src.text_factory=lambda b:b.decode("utf-8","replace")
cur=src.cursor()
cur.execute("CREATE TEMP TABLE plat AS SELECT host FROM live GROUP BY host HAVING COUNT(*)>=25")

F="""host NOT IN (SELECT host FROM plat) AND episodeCount>=3
 AND TRIM(COALESCE(title,''))<>'' AND TRIM(COALESCE(description,''))<>'' AND TRIM(COALESCE(imageUrl,''))<>''"""

rows=cur.execute(f"""SELECT id,url,title,link,itunesAuthor,itunesOwnerName,explicit,imageUrl,
 generator,newestItemPubdate,language,oldestItemPubdate,episodeCount,popularityScore,createdOn,
 host,newestEnclosureUrl,podcastGuid,description,category1,category2,category3,category4,category5,
 newestEnclosureDuration FROM live WHERE {F}""").fetchall()
print(f"candidates: {len(rows):,}")


# The Podcast Index `host` column sometimes holds a bare public suffix ("co.nz",
# "com.br") instead of the registrable domain. Those rows are mis-attributed and
# they duplicate the correctly-hosted copy of the same show under a second
# "host", which the dedupe below cannot see. Re-derive from the feed URL.
PUBLIC_SUFFIX = {
 "co.uk","com.br","org.au","com.au","org.uk","co.il","com.tr","co.jp","co.za","or.jp",
 "com.ar","com.mx","net.au","co.kr","co.nz","com.co","com.ua","ne.jp","com.tw","com.pl",
 "co.in","com.es","com.pe","com.ve","co.id","com.sg","com.hk","com.my","com.ph","com.vn",
 "go.jp","ac.uk","net.br","org.br","gov.uk","com.cn","net.nz","org.nz","com.ng","co.ke",
 "com.pk","org.za",
}

def real_host(host, url):
    h = (host or "").lower().strip()
    if h and h not in PUBLIC_SUFFIX:
        return h
    from urllib.parse import urlsplit
    net = urlsplit(url).netloc.lower().split(":")[0]
    net = re.sub(r"^www\.", "", net)
    return net or h

# Publishers declare <language> in whatever shape they like: "en_US", " en ",
# "English", "français", "ger_deu", or the ISO 639-2 "eng". This used to be
# `(lang or "").lower().split("-")[0][:5]`, which trimmed nothing, never split
# on "_", and cut at five characters — minting lang_base values like "franç",
# "engli", "ger_d" and " en " that /language/<code> has no page for, so the
# homepage and the sitemap both linked straight at 404s. Fold onto ISO 639-1,
# and return None when there is no honest two-letter code ("und", Scots, Luo):
# a show with no code is simply not offered under /language/*.
# Kept in step with normalizeLang() in src/lib/format.ts.
LANG_ALIAS = {
 "english":"en","eng":"en",
 "french":"fr","français":"fr","francais":"fr","fre":"fr","fra":"fr",
 "german":"de","deutsch":"de","ger":"de","deu":"de",
 "spanish":"es","español":"es","espanol":"es","spa":"es","esp":"es",
 "portuguese":"pt","português":"pt","portugues":"pt","por":"pt",
 "italian":"it","italiano":"it","ita":"it",
 "dutch":"nl","nederlands":"nl","nld":"nl","dut":"nl",
 "russian":"ru","rus":"ru",
 "japanese":"ja","jpn":"ja","jp":"ja",
 "chinese":"zh","zho":"zh","chi":"zh",
 "korean":"ko","kor":"ko",
 "swedish":"sv","svenska":"sv","swe":"sv",
 "danish":"da","dansk":"da","dan":"da",
 "norwegian":"no","norsk":"no","nor":"no",
 "finnish":"fi","suomi":"fi","fin":"fi",
 "polish":"pl","polski":"pl","pol":"pl",
 "czech":"cs","ces":"cs","cze":"cs",
 "turkish":"tr","tur":"tr",
 "arabic":"ar","ara":"ar",
 "hebrew":"he","heb":"he",
 "hindi":"hi","hin":"hi",
 "greek":"el","ell":"el","gre":"el",
 "romanian":"ro","ron":"ro","rum":"ro",
 "ukrainian":"uk","ukr":"uk",
 "hungarian":"hu","magyar":"hu","hun":"hu",
 "croatian":"hr","hrv":"hr",
 "serbian":"sr","srp":"sr",
 "slovak":"sk","slk":"sk","slo":"sk",
 "slovenian":"sl","slv":"sl",
 "bulgarian":"bg","bul":"bg",
 "catalan":"ca","català":"ca","catala":"ca","cat":"ca",
 "basque":"eu","euskara":"eu","eus":"eu","baq":"eu",
 "galician":"gl","glg":"gl",
 "icelandic":"is","isl":"is","ice":"is",
 "estonian":"et","est":"et",
 "latvian":"lv","lav":"lv",
 "lithuanian":"lt","lit":"lt",
 "persian":"fa","farsi":"fa","fas":"fa","per":"fa",
 "thai":"th","tha":"th",
 "vietnamese":"vi","vie":"vi",
 "indonesian":"id","bahasa":"id","ind":"id",
 "tagalog":"tl","filipino":"tl","tgl":"tl","fil":"tl",
 "malay":"ms","msa":"ms","may":"ms",
 "swahili":"sw","swa":"sw",
 "afrikaans":"af","afr":"af",
 "albanian":"sq","sqi":"sq","alb":"sq",
 "welsh":"cy","cym":"cy","wel":"cy",
 "irish":"ga","gle":"ga",
 "tamil":"ta","tam":"ta",
 "bengali":"bn","ben":"bn",
 "urdu":"ur","urd":"ur",
 "pashto":"ps","pus":"ps",
 "faroese":"fo","fao":"fo",
 "luxembourgish":"lb","ltz":"lb",
 "yiddish":"yi","yid":"yi",
 "armenian":"hy","hye":"hy","arm":"hy",
 "georgian":"ka","kat":"ka","geo":"ka",
}

def norm_lang(lang):
    s=(lang or "").strip().lower().replace("_","-")
    if not s: return None
    if s in LANG_ALIAS: return LANG_ALIAS[s]
    head=s.split("-")[0]
    if head in LANG_ALIAS: return LANG_ALIAS[head]
    if re.fullmatch(r"[a-z]{2}", head): return head
    return None

def slugify(s, maxlen=60):
    s=unicodedata.normalize("NFKD",s)
    s=s.encode("ascii","ignore").decode("ascii").lower()
    s=re.sub(r"[^a-z0-9]+","-",s).strip("-")
    return s[:maxlen].strip("-")

def clean(s):
    if not s: return ""
    s=re.sub(r"<[^>]+>"," ",s)              # strip html
    s=re.sub(r"&(nbsp|amp|lt|gt|quot|#39|#x27);"," ",s)
    return re.sub(r"\s+"," ",s).strip()

out=sqlite3.connect(DST)
out.execute("PRAGMA journal_mode=OFF")
out.execute("""CREATE TABLE podcasts(
 id INTEGER PRIMARY KEY, slug TEXT NOT NULL, guid TEXT, feed_url TEXT NOT NULL, title TEXT NOT NULL,
 description TEXT NOT NULL, image_url TEXT NOT NULL, link TEXT, host TEXT NOT NULL,
 author TEXT, owner TEXT, explicit INTEGER NOT NULL DEFAULT 0, language TEXT, lang_base TEXT,
 category TEXT, categories TEXT, episode_count INTEGER NOT NULL, newest_pubdate INTEGER NOT NULL,
 oldest_pubdate INTEGER, created_on INTEGER, latest_audio TEXT, latest_duration INTEGER,
 generator TEXT, per_week REAL, score REAL NOT NULL)""")

kept=[]; dropped_auto=0; seen_slug={}
for r in rows:
    (fid,url,title,link,author,owner,exp,img,gen,npd,lang,opd,ec,pop,co,host,enc,guid,desc,
     c1,c2,c3,c4,c5,dur)=r
    title=clean(title); desc=clean(desc)
    if not title or not desc: continue
    span=(npd-opd)/D if opd and npd and npd>opd else None
    rate=(ec/span) if span and span>=7 else None
    if rate and rate>=10:      # bulk-dump / content-farm signature
        dropped_auto+=1; continue
    per_week=round(rate*7,2) if rate else None
    age_d=(NOW-npd)/D
    fresh=1.0 if age_d<=7 else 0.85 if age_d<=30 else 0.6 if age_d<=60 else 0.4
    depth=math.log1p(min(ec,500))
    longevity=math.log1p((span or 0)/30.0)      # rewards feeds running for months/years
    score=round(depth*fresh + longevity*0.5,4)
    host=real_host(host,url)
    cats=[c for c in (c1,c2,c3,c4,c5) if c]
    base=slugify(title) or f"podcast"
    s=base
    if s in seen_slug: s=f"{base}-{fid}"
    seen_slug[s]=1
    lb=norm_lang(lang)
    kept.append((fid,s,guid,url,title,desc[:4000],img,link,host,author,owner,1 if exp else 0,
                 lang,lb,(c1 or None),",".join(cats),ec,npd,opd,co,enc,dur,gen,per_week,score))

out.executemany("INSERT INTO podcasts VALUES(" + ",".join("?"*25) + ")", kept)
# Collapse entries a reader cannot tell apart: same domain, same title, same
# episode count, same latest episode. Sites that publish per-category feeds emit
# a dozen of these with identical metadata. Keeping the shortest feed_url picks
# the canonical top-level feed. Deliberately NOT keyed on (host,title) alone --
# some stations run many distinct programmes under one generic title.
out.execute("""DELETE FROM podcasts WHERE id NOT IN (
  SELECT id FROM (SELECT id, ROW_NUMBER() OVER (
      PARTITION BY host, LOWER(TRIM(title)), episode_count, newest_pubdate
      ORDER BY LENGTH(feed_url), id) rn FROM podcasts) WHERE rn = 1)""")
print("after dedupe:", out.execute("SELECT COUNT(*) FROM podcasts").fetchone()[0])

out.execute("CREATE UNIQUE INDEX i_slug ON podcasts(slug)")
out.execute("CREATE INDEX i_cat ON podcasts(category)")
out.execute("CREATE INDEX i_lang ON podcasts(lang_base)")
out.execute("CREATE INDEX i_host ON podcasts(host)")
out.execute("CREATE INDEX i_score ON podcasts(score DESC)")
out.execute("CREATE INDEX i_new ON podcasts(newest_pubdate DESC)")
out.execute("CREATE VIRTUAL TABLE podcasts_fts USING fts5(title,description,author,host,content='podcasts',content_rowid='id',tokenize='unicode61 remove_diacritics 2')")
out.execute("INSERT INTO podcasts_fts(rowid,title,description,author,host) SELECT id,title,description,COALESCE(author,''),host FROM podcasts")
out.execute("INSERT INTO podcasts_fts(podcasts_fts) VALUES('optimize')")
out.commit()
n=out.execute("SELECT COUNT(*) FROM podcasts").fetchone()[0]
print(f"dropped as automated (>=10/day): {dropped_auto}")
print(f"FINAL: {n:,} podcasts")
print("distinct hosts:", out.execute("SELECT COUNT(DISTINCT host) FROM podcasts").fetchone()[0])
print("categories:", out.execute("SELECT COUNT(DISTINCT category) FROM podcasts WHERE category IS NOT NULL").fetchone()[0])
print("languages:", out.execute("SELECT COUNT(DISTINCT lang_base) FROM podcasts WHERE lang_base IS NOT NULL").fetchone()[0])
out.execute("VACUUM"); out.close()
print("size MB:", round(os.path.getsize(DST)/1e6,1))
