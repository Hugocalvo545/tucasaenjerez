import { storage, db } from "../shared/firebase.js";

export async function uploadPropertyImages({ propertyId, files }) {
  if (!propertyId) throw new Error("propertyId requerido");
  if (!files || files.length === 0) return [];

  const uploads = files.map((file) => {
    const fileRef = storage.ref().child(`properties/${propertyId}/${file.name}`);
    return fileRef.put(file);
  });

  await Promise.all(uploads);

  const urls = await Promise.all(
    files.map(async (file) => {
      const fileRef = storage.ref().child(`properties/${propertyId}/${file.name}`);
      return fileRef.getDownloadURL();
    })
  );

  await db.collection("apartamentos").doc(propertyId).set(
    { photos: urls },
    { merge: true }
  );

  return urls;
}