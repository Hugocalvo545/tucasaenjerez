import { db } from "../shared/firebase.js";

export async function fetchPacks() {
  const snap = await db.collection("packs").orderBy("orden", "asc").get();
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
}

export function subscribeToPacks(onData, onError) {
  return db
    .collection("packs")
    .orderBy("orden", "asc")
    .onSnapshot(
      (snap) => {
        const packs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        onData(packs, snap);
      },
      (err) => onError?.(err)
    );
}

export async function savePack(id, data) {
  const col = db.collection("packs");

  if (id) {
    await col.doc(id).set(data, { merge: true });
    return id;
  }

  const ref = col.doc();
  await ref.set(data);
  return ref.id;
}

export async function deletePack(id) {
  await db.collection("packs").doc(id).delete();
}
