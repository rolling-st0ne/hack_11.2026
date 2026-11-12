import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedHost,requestOrigin,publicOrigin} from '../server/network.mjs';

test('published Docker ports accept host IPs without allowing arbitrary DNS names',()=>{
  for(const host of ['localhost:3300','127.0.0.1:3000','192.168.100.83:3300','10.20.30.40:3000','203.0.113.42:3000','[::1]:3000','[fd00::2]:3000'])assert.equal(allowedHost(host,{}),true,host);
  for(const host of ['attacker.example:3000','192.168.100.83.attacker.example','localhost@attacker.example','localhost/evil','localhost?evil','localhost#evil','localhost\\evil','localhost\n',undefined])assert.equal(allowedHost(host,{}),false,String(host));
});

test('deployment hostnames must be explicitly configured',()=>{
  const env={CONTOUR_ALLOWED_HOSTS:'dashboard.lan, Dashboard.Example.com',CONTOUR_PUBLIC_ORIGIN:'https://dashboard.example.org'};
  for(const host of ['dashboard.lan:3000','dashboard.example.com','dashboard.example.org'])assert.equal(allowedHost(host,env),true);
  assert.equal(allowedHost('dashboard.example.org.attacker.example',env),false);
  assert.equal(allowedHost('unknown.example',{CONTOUR_ALLOWED_HOSTS:'*'}),false);
});

test('HTTPS proxy origin is explicit; LAN and health checks retain their own origin',()=>{
  const env={CONTOUR_PUBLIC_ORIGIN:'https://dashboard.example.org'};
  assert.equal(requestOrigin('dashboard.example.org',env),'https://dashboard.example.org');
  assert.equal(requestOrigin('127.0.0.1:3000',env),'http://127.0.0.1:3000');
  assert.equal(requestOrigin('192.168.1.20:3300',env),'http://192.168.1.20:3300');
  assert.equal(requestOrigin('dashboard.example.org:8080',env),'http://dashboard.example.org:8080');
  assert.equal(requestOrigin('dashboard.example.org:8443',{CONTOUR_PUBLIC_ORIGIN:'https://dashboard.example.org:8443'}),'https://dashboard.example.org:8443');
  for(const origin of ['https://dashboard.example.org/path','https://name:password@dashboard.example.org','file:///tmp','https://dashboard.example.org?x=1'])assert.throws(()=>publicOrigin({CONTOUR_PUBLIC_ORIGIN:origin}));
});
