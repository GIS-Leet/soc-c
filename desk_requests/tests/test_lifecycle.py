"""합성 인박스로 완료 검증과 재접수 보존을 시험한다."""
import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch
import importlib.util
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
spec=importlib.util.spec_from_file_location("requests_worker",pathlib.Path(__file__).resolve().parents[1]/"desk_requests.py")
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)
from lifecycle import request_id,result_path,verified_artifact,transition,save_inbox,claim_inbox,received_inbox

class LifecycleTests(unittest.TestCase):
    def test_canceled_after_crash_moves_existing_inbox_without_losing_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);inbox=root/'inbox';save_inbox(inbox,'a','manual edits')
            with patch.object(worker,'HERE',root),patch.object(worker,'INBOX',inbox),patch.object(worker,'token',return_value='fixture'),patch.object(worker,'db',return_value={'a':{'status':'canceled'}}),patch.object(worker,'log'),patch.object(worker,'notify') as notify:
                worker.main();notify.assert_not_called()
            self.assertFalse((inbox/'a.md').exists())
            self.assertEqual(next((root/'canceled').iterdir()).read_text(),'manual edits')
    def test_single_claim_and_canceled_receipt(self):
        value=claim_inbox({'status':'pending'},'a',1)
        self.assertEqual(claim_inbox(value,'b',2)['inboxOwner'],'a')
        self.assertEqual(claim_inbox(value,'b',120002)['inboxOwner'],'b')
        with self.assertRaises(ValueError):received_inbox({**value,'status':'canceled'},'a',3)
        self.assertEqual(received_inbox(value,'a',3)['status'],'received')
    def test_id_and_path_traversal_rejected(self):
        for rid in ('../x','a/b','a*'):
            with self.assertRaises(ValueError):request_id(rid)
        for path in ('수업/../secret','/수업/a.pdf','수업//a.pdf','other/a.pdf'):
            with self.assertRaises(ValueError):result_path(path)
        self.assertEqual(result_path('자료실/수업/a.pdf'),'수업/a.pdf')
    def test_missing_artifact_cannot_be_done(self):
        with self.assertRaises(ValueError):verified_artifact('수업/a.pdf',{})
        self.assertEqual(verified_artifact('수업/a.pdf',{'type':'file','path':'수업/a.pdf','sha':'a'*40})['sha'],'a'*40)
    def test_terminal_and_repeated_receive(self):
        with self.assertRaises(ValueError):transition({'status':'canceled'},'done',1)
        value={'status':'working','title':'test'}
        self.assertEqual(transition(value,'received',1),value)
    def test_duplicate_inbox_preserves_manual_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            path=save_inbox(directory,'a','initial');path.write_text('manual')
            self.assertEqual(save_inbox(directory,'a','retry').read_text(),'manual')

if __name__=='__main__':unittest.main()
