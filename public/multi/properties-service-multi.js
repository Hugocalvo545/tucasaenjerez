import { db } from '../shared/firebase.js';

export function subscribeApartamentosActivos(onChange, onError) {
  return db
    .collection('apartamentos')
    .orderBy('orden')
    .onSnapshot(
      (snap) => {
        const apartamentos = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(a => a.activa === true);
        onChange(apartamentos);
      },
      (err) => onError?.(err)
    );
}

export function subscribePacksActivos(onChange, onError) {
  return db
    .collection('packs')
    .orderBy('orden')
    .onSnapshot(
      (snap) => {
        const packs = snap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(p => p.activa === true);
        onChange(packs);
      },
      (err) => onError?.(err)
    );
}
