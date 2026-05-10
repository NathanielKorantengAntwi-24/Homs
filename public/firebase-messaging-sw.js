// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDVk-KAlMMSoQxHjVCgJae3YCud87vw2Vo",
  authDomain: "homs-system-d71d5.firebaseapp.com",
  projectId: "homs-system-d71d5",
  storageBucket: "homs-system-d71d5.firebasestorage.app",
  messagingSenderId: "275297500250",
  appId: "1:275297500250:web:31baae3e687bf7905d2c63"
});

const messaging = firebase.messaging();

// This "listens" for a notification when the app is in the background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background Message received: ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/logo192.png' // Make sure you have an icon in your public folder!
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});