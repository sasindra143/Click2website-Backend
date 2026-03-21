import admin from 'firebase-admin';

try {
  if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

      admin.initializeApp({
        credential: admin.credential.cert({
          ...serviceAccount,
          private_key: serviceAccount.private_key.replace(/\\n/g, '\n')
        })
      });

      console.log('✅ Firebase Admin initialized successfully');
    } else {
      throw new Error('FIREBASE_SERVICE_ACCOUNT missing');
    }
  }
} catch (error) {
  console.error('❌ Firebase Admin initialization error:', error.message);
}

export default admin;