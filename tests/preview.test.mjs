// 비공개 자료는 새 탭에서도 같은 출처 권한 없이 렌더함.
import test from 'node:test';import assert from 'node:assert/strict';
import {previewLocation,allowedBlobURL} from '../assets/preview.mjs';
test('활성 문서는 새 탭에서도 격리 뷰어를 거친다',()=>{
 assert.equal(previewLocation('blob:https://nyuheatgis.com/uuid','html'),'material-viewer.html#'+encodeURIComponent('blob:https://nyuheatgis.com/uuid'));
 assert.equal(previewLocation('blob:https://nyuheatgis.com/uuid','svg'),'material-viewer.html#'+encodeURIComponent('blob:https://nyuheatgis.com/uuid'));
 assert.equal(previewLocation('blob:https://nyuheatgis.com/uuid','pdf'),'blob:https://nyuheatgis.com/uuid');
});
test('격리 뷰어는 같은 출처에서 만든 blob만 받는다',()=>{
 assert.equal(allowedBlobURL('#'+encodeURIComponent('blob:https://nyuheatgis.com/uuid'),'https://nyuheatgis.com'),'blob:https://nyuheatgis.com/uuid');
 for(const url of ['javascript:alert(1)','https://example.com','blob:https://example.com/id','%'])assert.equal(allowedBlobURL('#'+url,'https://nyuheatgis.com'),null);
});
