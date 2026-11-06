import http.server,threading,json,time,pathlib,subprocess,os,signal,datetime,hashlib
root=pathlib.Path('/evidence')
requests=[]
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def event(value):
 with (root/'request-trace.jsonl').open('a') as f: f.write(json.dumps(value)+'\n')
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  code=204 if self.path=='/bridge204' else 404
  record={'at':now(),'method':'GET','path':self.path,'status':code,'client':self.client_address[0]}; requests.append(record);event(record)
  self.send_response(code);self.end_headers()
 def log_message(self,*args): pass
server=http.server.HTTPServer(('127.0.0.1',18749),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
env=os.environ.copy()
assert 'ASTRAEA_SMOKE_OUT' not in env
for key,value in {'ASTRAEA_STARTUP_TRACE_OUT':'/evidence/startup.jsonl','LIBGL_ALWAYS_SOFTWARE':'1','WEBKIT_DISABLE_COMPOSITING_MODE':'1','XDG_CONFIG_HOME':'/evidence/xdg/config','XDG_DATA_HOME':'/evidence/xdg/data','XDG_CACHE_HOME':'/evidence/xdg/cache','XDG_RUNTIME_DIR':'/evidence/xdg/runtime'}.items(): env[key]=value
pathlib.Path(env['XDG_RUNTIME_DIR']).mkdir(parents=True,exist_ok=True);os.chmod(env['XDG_RUNTIME_DIR'],0o700)
command=['dbus-run-session','--','xvfb-run','-a','/evidence/bridge204-debug']
start=now();event({'at':start,'event':'fixture_launch','command':command})
with (root/'app.log').open('w') as log:
 process=subprocess.Popen(command,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 deadline=time.monotonic()+45; ready=False
 while time.monotonic()<deadline and process.poll() is None:
  trace=(root/'startup.jsonl').read_text() if (root/'startup.jsonl').exists() else ''
  if any(r['path']=='/bridge204' and r['status']==204 for r in requests) and 'root_present_5s' in trace:
   ready=True;break
  time.sleep(.2)
 before_stop=process.poll();stop_at=now()
 if before_stop is None:
  os.killpg(process.pid,signal.SIGTERM)
  try: process.wait(timeout=8)
  except subprocess.TimeoutExpired:
   os.killpg(process.pid,signal.SIGKILL);process.wait();forced=True
  else: forced=False
 else: forced=False
server.shutdown();server.server_close()
result={'startedAt':start,'stoppedAt':stop_at,'pid':process.pid,'ready':ready,'exitBeforeControlledStop':before_stop,'wrapperExitCode':process.returncode,'controlledStop':'SIGTERM process group' if before_stop is None else 'not needed; early exit','forcedKill':forced,'requestCount':len(requests),'exact204Count':sum(r['path']=='/bridge204' and r['status']==204 for r in requests),'otherRequests':[r for r in requests if r['path']!='/bridge204'],'scope':'native check transport only; controlled stop is not app completion'}
(root/'exit-control.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result));raise SystemExit(0 if ready and not forced and not result['otherRequests'] else 1)
