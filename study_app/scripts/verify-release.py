#!/usr/bin/env python3
"""실제 서명 번들의 버전·Firebase 대상·확장·프로필을 검증하고 OTA manifest를 만든다."""
import argparse
import datetime
import hashlib
import json
import pathlib
import plistlib
import subprocess
import tempfile
import zipfile

BUNDLE='nyuheatgis';TEAM='JUD3Y3XYZ7';PROJECT='soc-c-qna'

def validate_info(info):
    if info.get('CFBundleIdentifier')!=BUNDLE:raise ValueError('Wrong bundle ID')
    if not str(info.get('CFBundleVersion','')).isdigit():raise ValueError('Invalid build number')
    if not info.get('CFBundleShortVersionString'):raise ValueError('Missing marketing version')

def checked(args):
    result=subprocess.run(args,capture_output=True)
    if result.returncode:raise ValueError('Signature/profile verification failed')
    return result.stdout

def verify(app):
    app=pathlib.Path(app);root=app/'Contents' if (app/'Contents/Info.plist').exists() else app
    info=plistlib.loads((root/'Info.plist').read_bytes());validate_info(info)
    checked(['codesign','--verify','--deep','--strict',str(app)])
    signed=subprocess.run(['codesign','-dv','--verbose=4',str(app)],capture_output=True,text=True)
    if signed.returncode or 'TeamIdentifier='+TEAM not in signed.stderr:raise ValueError('Wrong signing team')
    configs=list(root.rglob('GoogleService-Info.plist'))
    if not configs or any(plistlib.loads(p.read_bytes()).get('PROJECT_ID')!=PROJECT for p in configs):raise ValueError('Wrong Firebase project')
    for extension in root.rglob('*.appex'):
        meta=extension/'Info.plist'
        if not meta.exists():meta=extension/'Contents/Info.plist'
        ext=plistlib.loads(meta.read_bytes())
        if not ext.get('CFBundleIdentifier','').startswith(BUNDLE+'.') or str(ext.get('CFBundleVersion'))!=str(info['CFBundleVersion']):raise ValueError('Extension metadata mismatch')
    profile=root/'embedded.mobileprovision'
    if profile.exists():
        provision=plistlib.loads(checked(['security','cms','-D','-i',str(profile)]))
        if provision['ExpirationDate']<=datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):raise ValueError('Expired provisioning profile')
        ent=provision.get('Entitlements',{})
        if ent.get('application-identifier')!=TEAM+'.'+BUNDLE:raise ValueError('Profile target mismatch')
    return info

def main():
    p=argparse.ArgumentParser();p.add_argument('artifact');p.add_argument('--url');p.add_argument('--manifest');p.add_argument('--report');a=p.parse_args();artifact=pathlib.Path(a.artifact)
    with tempfile.TemporaryDirectory(prefix='desk-release-verify-') as temp:
        if artifact.suffix=='.ipa':
            with zipfile.ZipFile(artifact) as archive:
                for name in archive.namelist():
                    if name.startswith('/') or '..' in pathlib.PurePosixPath(name).parts:raise ValueError('Invalid archive path')
                archive.extractall(temp)
            apps=list((pathlib.Path(temp)/'Payload').glob('*.app'))
            if len(apps)!=1:raise ValueError('Expected one app')
            info=verify(apps[0]);digest=hashlib.sha256(artifact.read_bytes()).hexdigest()
        else:info=verify(artifact);digest=None
    report={'bundle':BUNDLE,'version':info['CFBundleShortVersionString'],'build':str(info['CFBundleVersion']),'sha256':digest,'firebase':PROJECT}
    if a.manifest:
        if not a.url or not a.url.startswith('https://'):raise ValueError('HTTPS IPA URL required')
        manifest={'items':[{'assets':[{'kind':'software-package','url':a.url}],'metadata':{'bundle-identifier':BUNDLE,'bundle-version':str(info['CFBundleVersion']),'kind':'software','title':'Desk '+info['CFBundleShortVersionString']+' ('+str(info['CFBundleVersion'])+')'}}]}
        pathlib.Path(a.manifest).write_bytes(plistlib.dumps(manifest))
    if a.report:pathlib.Path(a.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':main()
