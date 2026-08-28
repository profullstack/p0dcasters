import sqlite3, time, os
SRC="/home/anthony/p0dcasters-data/podcastindex_feeds.db"
DST="/home/anthony/p0dcasters-data/p0dcasters_live.db"
NOW=int(time.time()); D=86400
if os.path.exists(DST): os.remove(DST)
con=sqlite3.connect(DST, uri=True)
con.text_factory=lambda b: b.decode("utf-8","replace")
con.execute("PRAGMA journal_mode=OFF"); con.execute("PRAGMA synchronous=OFF")
con.execute(f"ATTACH DATABASE 'file:{SRC}?mode=ro' AS src")
cols="""id,url,title,link,lastHttpStatus,contentType,itunesId,itunesAuthor,itunesOwnerName,
explicit,imageUrl,itunesType,generator,newestItemPubdate,language,oldestItemPubdate,
episodeCount,popularityScore,createdOn,updateFrequency,host,newestEnclosureUrl,podcastGuid,
description,category1,category2,category3,category4,category5,newestEnclosureDuration"""
cut=NOW-90*D
t=time.time()
con.execute(f"CREATE TABLE live AS SELECT {cols} FROM src.podcasts WHERE lastHttpStatus=200 AND newestItemPubdate>{cut} AND newestItemPubdate<={NOW}")
n=con.execute("SELECT COUNT(*) FROM live").fetchone()[0]
print(f"live rows: {n:,} in {time.time()-t:.0f}s")
for idx in ["CREATE INDEX i_host ON live(host)","CREATE INDEX i_lang ON live(language)",
            "CREATE INDEX i_cat ON live(category1)","CREATE INDEX i_pub ON live(newestItemPubdate DESC)",
            "CREATE INDEX i_pop ON live(popularityScore DESC)","CREATE UNIQUE INDEX i_guid ON live(podcastGuid)"]:
    try: con.execute(idx)
    except Exception as e: print("idx skip:",e)
con.commit()
# independent cut: exclude top-100 hosting platforms by live volume
top=[r[0] for r in con.execute("SELECT host FROM live GROUP BY host ORDER BY COUNT(*) DESC LIMIT 100")]
qs=",".join("?"*len(top))
ind=con.execute(f"SELECT COUNT(*) FROM live WHERE host NOT IN ({qs})",top).fetchone()[0]
print(f"independent (not on top-100 platform hosts): {ind:,}")
eng=con.execute("SELECT COUNT(*) FROM live WHERE language LIKE 'en%'").fetchone()[0]
print(f"english live: {eng:,}")
con.execute("VACUUM"); con.close()
print("size:", os.path.getsize(DST)/1e6, "MB")
