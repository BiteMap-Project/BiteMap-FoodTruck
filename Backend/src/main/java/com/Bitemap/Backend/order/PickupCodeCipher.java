package com.Bitemap.Backend.order;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Encrypts customer-retrievable codes; never use an order ID as a secret. */
final class PickupCodeCipher {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final SecretKeySpec key;

    PickupCodeCipher(byte[] key) {
        if (key == null || key.length != 32) throw new IllegalArgumentException("Pickup encryption requires a 256-bit key.");
        this.key = new SecretKeySpec(key.clone(), "AES");
    }

    String encrypt(long orderId, String code) {
        if (orderId <= 0 || code == null || !code.matches("[0-9]{6}"))
            throw new IllegalArgumentException("Invalid pickup code input.");
        byte[] nonce = new byte[12]; RANDOM.nextBytes(nonce);
        try {
            byte[] encrypted = cipher(Cipher.ENCRYPT_MODE, orderId, nonce).doFinal(code.getBytes(StandardCharsets.US_ASCII));
            byte[] envelope = Arrays.copyOf(nonce, nonce.length + encrypted.length);
            System.arraycopy(encrypted, 0, envelope, nonce.length, encrypted.length);
            return Base64.getEncoder().encodeToString(envelope);
        } catch (GeneralSecurityException error) {
            throw new IllegalStateException("Pickup code encryption unavailable.");
        }
    }

    String decrypt(long orderId, String ciphertext) {
        try {
            byte[] envelope = Base64.getDecoder().decode(ciphertext);
            // 12-byte nonce + six ASCII digits + 16-byte authentication tag.
            if (orderId <= 0 || envelope.length != 34) throw new IllegalArgumentException();
            byte[] plaintext = cipher(Cipher.DECRYPT_MODE, orderId, Arrays.copyOf(envelope, 12))
                .doFinal(Arrays.copyOfRange(envelope, 12, envelope.length));
            String code = new String(plaintext, StandardCharsets.US_ASCII);
            if (!code.matches("[0-9]{6}")) throw new IllegalArgumentException();
            return code;
        } catch (GeneralSecurityException | IllegalArgumentException | NullPointerException error) {
            // Do not include ciphertext, keys or provider exceptions in an API/log message.
            throw new IllegalStateException("Pickup code unavailable.");
        }
    }

    private Cipher cipher(int mode, long orderId, byte[] nonce) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(mode, key, new GCMParameterSpec(128, nonce));
        cipher.updateAAD(("bitemap-pickup-v1:" + orderId).getBytes(StandardCharsets.US_ASCII));
        return cipher;
    }
}
