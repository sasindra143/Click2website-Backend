import admin from 'firebase-admin';

try {
  if (!admin.apps.length) {
    // Force Initialization using pure Project ID to bypass Render JSON mismatches
    admin.initializeApp({
      projectId: 'click2website-fec34' // Provided by the user directly
    });
    console.log('✅ Firebase Admin initialized seamlessly via Project ID for Token Verification');
  }
} catch (error) {
  console.error('❌ Firebase Admin initialization error:', error.message);
}

export default admin;