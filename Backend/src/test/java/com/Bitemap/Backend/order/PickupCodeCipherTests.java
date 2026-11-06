package com.Bitemap.Backend.order;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PickupCodeCipherTests {
    private final byte[] key = new byte[32];

    @Test void preservesLeadingZerosAndUsesFreshNonces() {
        var cipher = new PickupCodeCipher(key);
        String first = cipher.encrypt(42, "000123");
        String second = cipher.encrypt(42, "000123");
        assertThat(first).isNotEqualTo(second).doesNotContain("000123");
        assertThat(cipher.decrypt(42, first)).isEqualTo("000123");
    }

    @Test void rejectsAnotherOrderAndAnotherKey() {
        var cipher = new PickupCodeCipher(key);
        String encrypted = cipher.encrypt(42, "123456");
        assertThatThrownBy(() -> cipher.decrypt(43, encrypted)).isInstanceOf(IllegalStateException.class);
        byte[] otherKey = new byte[32]; otherKey[0] = 1;
        assertThatThrownBy(() -> new PickupCodeCipher(otherKey).decrypt(42, encrypted)).isInstanceOf(IllegalStateException.class);
    }

    @Test void rejectsMalformedCiphertextAndInvalidKeySize() {
        assertThatThrownBy(() -> new PickupCodeCipher(new byte[16])).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new PickupCodeCipher(key).decrypt(42, "not ciphertext")).isInstanceOf(IllegalStateException.class);
    }
}
