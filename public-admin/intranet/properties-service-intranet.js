import { db } from "../shared/firebase.js";

export async function fetchProperties() {
  try {
    const snap = await db.collection("apartamentos").orderBy("orden").get();
    return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("Error cargando propiedades:", error);
    throw new Error("Error cargando propiedades");
  }
}

export function subscribeToProperties(onData, onError) {
  return db
    .collection("apartamentos")
    .orderBy("orden")
    .onSnapshot(
      (snap) => {
        const props = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        onData(props, snap);
      },
      (err) => onError?.(err)
    );
}

export async function saveProperty(id, data) {
  const col = db.collection("apartamentos");

  if (id) {
    await col.doc(id).set(data, { merge: true });
    return id;
  }

  const ref = col.doc();
  await ref.set(data);
  return ref.id;
}

export async function deleteProperty(id) {
  await db.collection("apartamentos").doc(id).delete();
}
