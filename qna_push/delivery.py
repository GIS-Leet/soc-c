"""이벤트·기기별 원자 점유와 재시도를 제공하며 APNs 수락만 완료로 기록한다."""
import hashlib
import uuid

PERMANENT = {(410, 'Unregistered'), (400, 'BadDeviceToken')}

def event_id(*parts):
    return hashlib.sha256('/'.join(map(str, parts)).encode()).hexdigest()

def claim(value, owner, now):
    if not value or value.get('state') in ('accepted', 'invalid'):
        return value
    if value.get('leaseUntil', 0) > now or value.get('retryAt', 0) > now:
        return value
    return {**value, 'state': 'sending', 'owner': owner, 'leaseUntil': now + 120, 'attempts': value.get('attempts', 0) + 1}

def finish(value, owner, status, reason, now):
    if not value or value.get('owner') != owner:
        return value
    state = 'accepted' if status == 200 else 'invalid' if (status, reason) in PERMANENT else 'retry'
    delay = min(3600, 30 * 2 ** min(value.get('attempts', 1), 7))
    return {**value, 'state': state, 'status': status, 'reason': reason[:80], 'leaseUntil': 0, 'retryAt': now + delay if state == 'retry' else 0, 'updatedAt': now}

def deliver_pending(events, transaction, send, now, remove_token):
    """transaction(path, transform) must return the atomically committed value."""
    owner = str(uuid.uuid4())
    counts = {'accepted': 0, 'retry': 0, 'invalid': 0}
    for eid, event in events.items():
        for device, delivery in event.get('devices', {}).items():
            path = f'desk/push/events/{eid}/devices/{device}'
            acquired = transaction(path, lambda value: claim(value, owner, now()))
            if not acquired or acquired.get('owner') != owner or acquired.get('state') != 'sending':
                continue
            try:
                status, reason = send(device, event, acquired)
            except Exception:
                status, reason = 0, 'TransportError'
            result = transaction(path, lambda value: finish(value, owner, status, reason, now()))
            if not result or result.get('owner') != owner:
                continue
            state = result['state']; counts[state] += 1
            if state == 'invalid':
                # Only delete the exact registration that generated this delivery.
                remove_token(device, acquired.get('registeredAt'))
    return counts
