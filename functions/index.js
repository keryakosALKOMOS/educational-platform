const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

// Helper to check if caller is admin
async function isAdmin(auth) {
  if (!auth) return false;
  const userDoc = await admin.firestore().collection("users").doc(auth.uid).get();
  return userDoc.exists && userDoc.data().role === "admin";
}

// 1. Redeem Code
exports.redeemCode = onCall(async (request) => {
  const { code } = request.data;
  const { auth } = request;
  if (!auth) throw new HttpsError("unauthenticated", "User must be logged in.");

  const db = admin.firestore();
  const codeRef = db.collection("codes").doc(code);

  return await db.runTransaction(async (transaction) => {
    const codeDoc = await transaction.get(codeRef);
    if (!codeDoc.exists || codeDoc.data().is_used) {
      throw new HttpsError("not-found", "Invalid or already used code.");
    }

    const userRef = db.collection("users").doc(auth.uid);
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found.");

    const settings = await db.collection("app_settings").doc("global").get();
    const coinsPerCode = settings.data()?.coins_per_code || 1;

    transaction.update(codeRef, {
      is_used: true,
      used_by: auth.uid,
      used_at: admin.firestore.FieldValue.serverTimestamp()
    });

    transaction.update(userRef, {
      coins: admin.firestore.FieldValue.increment(coinsPerCode)
    });

    return { success: true, coins_added: coinsPerCode };
  });
});

// 2. Unlock Video
exports.unlockVideo = onCall(async (request) => {
  const { videoPath } = request.data;
  const { auth } = request;
  if (!auth) throw new HttpsError("unauthenticated", "User must be logged in.");

  const db = admin.firestore();
  const userRef = db.collection("users").doc(auth.uid);
  const videoPriceRef = db.collection("video_prices").doc(videoPath);

  return await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    const priceDoc = await transaction.get(videoPriceRef);
    
    if (!userDoc.exists) throw new HttpsError("not-found", "User not found.");
    const price = priceDoc.exists ? priceDoc.data().price : 0;

    if (userDoc.data().coins < price) {
      throw new HttpsError("failed-precondition", "Insufficient coins.");
    }

    const unlockRef = userRef.collection("unlocked_videos").doc(videoPath);
    transaction.set(unlockRef, {
      unlocked_at: admin.firestore.FieldValue.serverTimestamp()
    });

    transaction.update(userRef, {
      coins: admin.firestore.FieldValue.increment(-price)
    });

    return { success: true };
  });
});

// 3. Generate Codes (Admin)
exports.generateCodes = onCall(async (request) => {
  if (!(await isAdmin(request.auth))) {
    throw new HttpsError("permission-denied", "Only admins can generate codes.");
  }

  const { count, coinsPerCode } = request.data;
  const db = admin.firestore();
  const batch = db.batch();

  const codeBatchRef = db.collection("code_batches").doc();
  batch.set(codeBatchRef, {
    created_at: admin.firestore.FieldValue.serverTimestamp(),
    count,
    coins_per_code: coinsPerCode
  });

  for (let i = 0; i < count; i++) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase() + Math.random().toString(36).substring(2, 8).toUpperCase();
    const codeRef = db.collection("codes").doc(code);
    batch.set(codeRef, {
      code,
      is_used: false,
      batch_id: codeBatchRef.id
    });
  }

  await batch.commit();
  return { success: true, batchId: codeBatchRef.id };
});

// 4. Generate Exam (AI)
exports.generateExam = onCall(async (request) => {
  if (!(await isAdmin(request.auth))) {
    throw new HttpsError("permission-denied", "Only admins can generate exams.");
  }

  const { title, topic, count, difficulty } = request.data;
  // Gemini implementation placeholder
  // const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // ... logic to call Gemini and save questions to Firestore
  
  return { success: true, message: "AI exam generation initiated." };
});
