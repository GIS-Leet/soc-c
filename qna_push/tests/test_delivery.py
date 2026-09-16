"""운영 연결 없이 다중 워커·대량 알림·일부 기기 실패를 시험한다."""
import copy
import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from delivery import claim, finish, deliver_pending

class DeliveryTests(unittest.TestCase):
    def test_atomic_claim_and_expired_lease(self):
        first=claim({'state':'pending'},'a',100)
        self.assertEqual(claim(first,'b',101)['owner'],'a')
        second=claim(first,'b',221)
        self.assertEqual(second['owner'],'b')
        self.assertEqual(finish(second,'a',200,'',222),second)
    def test_only_specific_invalid_reason(self):
        value=claim({'state':'pending'},'a',1)
        for status,reason in [(400,'BadTopic'),(400,'DeviceTokenNotForTopic'),(429,'TooManyRequests'),(503,'ServiceUnavailable')]:
            self.assertEqual(finish(value,'a',status,reason,2)['state'],'retry')
        self.assertEqual(finish(value,'a',410,'Unregistered',2)['state'],'invalid')
    def test_hundred_events_and_partial_failure_survive_restart(self):
        events={str(i):{'devices':{'a':{'state':'pending'},'b':{'state':'pending'}}} for i in range(100)}
        def transaction(path,fn):
            _,_,_,eid,_,device=path.split('/')
            events[eid]['devices'][device]=fn(copy.deepcopy(events[eid]['devices'][device]))
            return events[eid]['devices'][device]
        counts=deliver_pending(copy.deepcopy(events),transaction,lambda device,e,d:(200,'') if device=='a' else (503,'ServiceUnavailable'),lambda:100,lambda *_:None)
        self.assertEqual(counts,{'accepted':100,'retry':100,'invalid':0})
        counts=deliver_pending(copy.deepcopy(events),transaction,lambda *_:(200,''),lambda:1000,lambda *_:None)
        self.assertEqual(counts['accepted'],100)
        self.assertTrue(all(d['state']=='accepted' for e in events.values() for d in e['devices'].values()))

if __name__=='__main__': unittest.main()
