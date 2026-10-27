package com.Bitemap.Backend.auth;

import com.Bitemap.Backend.auth.recovery.RecoverySettings;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class RecoverySettingsTests {
    @ParameterizedTest
    @ValueSource(strings={"", "http://example.com/reset-password", "https://user@example.com/reset-password",
            "https://example.com/reset-password?next=evil", "https://example.com/reset-password#token=a", "https://example.com/wrong"})
    void rejectsUnsafeResetUrls(String url) {
        assertThatThrownBy(() -> new RecoverySettings(true,url,"no-reply@example.com",false)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void localhostHttpRequiresExplicitOptIn() {
        assertThatThrownBy(() -> new RecoverySettings(true,"http://localhost:5173/reset-password","no-reply@example.com",false)).isInstanceOf(IllegalArgumentException.class);
        assertThatCode(() -> new RecoverySettings(true,"http://localhost:5173/reset-password","no-reply@example.com",true)).doesNotThrowAnyException();
    }
}
