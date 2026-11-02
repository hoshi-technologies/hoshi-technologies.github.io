// Génère une clé de chiffrement de 32 octets pour DATA_ENCRYPTION_KEY / BACKUP_ENCRYPTION_KEY.
// À conserver dans le gestionnaire de secrets de l'hébergeur ET hors ligne : sans elle,
// les données et les sauvegardes sont illisibles.
import { generateKey } from '../src/crypto.js';
console.log(generateKey());
