import sqlite3, csv, collections, time, sys

DB="/home/anthony/p0dcasters-data/podcastindex_feeds.db"
TRANCO="/home/anthony/p0dcasters-data/tranco_26J39.csv"
NOW=int(time.time())
D=86400

tranco={}
with open(TRANCO) as f:
    for rank,dom in csv.reader(f):
        tranco[dom]=int(rank)
print(f"tranco loaded: {len(tranco):,}")

con=sqlite3.connect(f"file:{DB}?mode=ro",uri=True)
con.text_factory=lambda b: b.decode('utf-8','replace')
cur=con.cursor()

tot=0
dead=0
have_guid=0; have_img=0; have_desc=0; have_itunes=0; explicit=0
http=collections.Counter()
lang=collections.Counter()
cat=collections.Counter()
gen=collections.Counter()
hosts=collections.Counter()
hosts_live=collections.Counter()
recency=collections.Counter()
epi=collections.Counter()
pop=collections.Counter()
live_ids=0

t0=time.time()
sql="""SELECT dead,lastHttpStatus,newestItemPubdate,episodeCount,popularityScore,
language,host,category1,podcastGuid,imageUrl,description,itunesId,explicit,generator
FROM podcasts"""
for (dd,st,npd,ec,ps,lg,ho,c1,guid,img,desc,itid,exp,g) in cur.execute(sql):
    tot+=1
    isdead = bool(dd)
    if isdead: dead+=1
    http[st]+=1
    if guid: have_guid+=1
    if img: have_img+=1
    if desc: have_desc+=1
    if itid: have_itunes+=1
    if exp: explicit+=1
    if lg: lang[lg.lower().strip()[:5]]+=1
    if c1: cat[c1]+=1
    if g: gen[g[:40]]+=1
    if ho:
        h=ho.lower().strip()
        hosts[h]+=1
    # recency buckets
    age = (NOW-npd)/D if npd and npd>0 else None
    if age is None or npd<=0: recency['never/unknown']+=1
    elif age<0: recency['future-dated']+=1
    elif age<=30: recency['<=30d']+=1
    elif age<=90: recency['31-90d']+=1
    elif age<=365: recency['91-365d']+=1
    elif age<=365*3: recency['1-3y']+=1
    else: recency['>3y']+=1
    # "live" = not dead, 200, published in last 90d
    if (not isdead) and st==200 and npd and (NOW-npd)<=90*D:
        live_ids+=1
        if ho: hosts_live[ho.lower().strip()]+=1
    if ec is None or ec<=0: epi['0']+=1
    elif ec<=5: epi['1-5']+=1
    elif ec<=20: epi['6-20']+=1
    elif ec<=100: epi['21-100']+=1
    else: epi['>100']+=1
    pop[ps if ps is not None else 0]+=1

el=time.time()-t0
print(f"scanned {tot:,} rows in {el:.0f}s")
print()
print("=== LIVENESS ===")
print(f"total                 {tot:,}")
print(f"dead=1                {dead:,}  ({dead/tot*100:.1f}%)")
print(f"LIVE (not dead,200,pub<=90d)  {live_ids:,}  ({live_ids/tot*100:.1f}%)")
print()
print("=== last HTTP status (top 12) ===")
for k,v in http.most_common(12): print(f"  {str(k):<8} {v:,}")
print()
print("=== newest item pubdate ===")
for k in ['<=30d','31-90d','91-365d','1-3y','>3y','never/unknown','future-dated']:
    v=recency.get(k,0); print(f"  {k:<16} {v:,}  ({v/tot*100:.1f}%)")
print()
print("=== episode count ===")
for k in ['0','1-5','6-20','21-100','>100']:
    v=epi.get(k,0); print(f"  {k:<8} {v:,} ({v/tot*100:.1f}%)")
print()
print("=== metadata completeness ===")
for lbl,v in [('podcastGuid',have_guid),('imageUrl',have_img),('description',have_desc),('itunesId',have_itunes),('explicit',explicit)]:
    print(f"  {lbl:<14} {v:,} ({v/tot*100:.1f}%)")
print()
print("=== languages (top 15) ===")
for k,v in lang.most_common(15): print(f"  {k:<8} {v:,}")
print()
print("=== category1 (top 20) ===")
for k,v in cat.most_common(20): print(f"  {k:<24} {v:,}")
print()
print("=== generators (top 20) ===")
for k,v in gen.most_common(20): print(f"  {k:<42} {v:,}")
print()
print(f"=== HOSTS: {len(hosts):,} distinct ===")
print("top 25 hosts by ALL feeds:")
for k,v in hosts.most_common(25):
    r=tranco.get(k)
    print(f"  {k:<38} {v:>9,}  tranco={r if r else '-'}")
print()
print("top 25 hosts by LIVE feeds:")
for k,v in hosts_live.most_common(25):
    r=tranco.get(k)
    print(f"  {k:<38} {v:>9,}  tranco={r if r else '-'}")

# tranco coverage
inT=sum(v for h,v in hosts.items() if h in tranco)
inT_live=sum(v for h,v in hosts_live.items() if h in tranco)
hosts_inT=sum(1 for h in hosts if h in tranco)
print()
print("=== TRANCO JOIN ===")
print(f"distinct hosts in tranco 1M: {hosts_inT:,} / {len(hosts):,} ({hosts_inT/len(hosts)*100:.1f}%)")
print(f"feeds on a tranco host:      {inT:,} / {tot:,} ({inT/tot*100:.1f}%)")
print(f"LIVE feeds on tranco host:   {inT_live:,} / {live_ids:,} ({inT_live/max(live_ids,1)*100:.1f}%)")

# concentration
tops=hosts.most_common()
c10=sum(v for _,v in tops[:10]); c100=sum(v for _,v in tops[:100])
print()
print("=== CONCENTRATION (all feeds) ===")
print(f"top10 hosts:  {c10:,} ({c10/tot*100:.1f}%)")
print(f"top100 hosts: {c100:,} ({c100/tot*100:.1f}%)")
tl=hosts_live.most_common()
l10=sum(v for _,v in tl[:10]); l100=sum(v for _,v in tl[:100])
print(f"LIVE top10:   {l10:,} ({l10/max(live_ids,1)*100:.1f}%)")
print(f"LIVE top100:  {l100:,} ({l100/max(live_ids,1)*100:.1f}%)")
# self-hosted-ish: hosts with < 10 feeds
small=sum(v for h,v in hosts_live.items() if hosts_live[h]<=3)
print(f"LIVE feeds on hosts with <=3 live feeds (self-hosted-ish): {small:,} ({small/max(live_ids,1)*100:.1f}%)")
print()
print("=== popularityScore ===")
nz=sum(v for k,v in pop.items() if k and k>0)
print(f"nonzero popularityScore: {nz:,} ({nz/tot*100:.1f}%)")
for k,v in sorted(pop.items())[:12]: print(f"  score {k}: {v:,}")
