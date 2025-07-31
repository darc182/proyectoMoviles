import { auth, database } from './firebase-config.js';
import { ref, get } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

export async function verifyUserExists() {
    const currentUser = auth.currentUser;
    if (!currentUser) return false;

    try {
        const userRef = ref(database, `users/${currentUser.uid}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            alert('Tu cuenta ha sido eliminada. Contacta al administrador.');
            await signOut(auth);
            window.location.href = '/login.html';
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error verificando usuario:', error);
        return false;
    }
}

// Verificar periódicamente (cada 5 minutos)
export function startPeriodicCheck() {
    setInterval(async () => {
        if (auth.currentUser) {
            await verifyUserExists();
        }
    }, 300000); // 5 minutos
}