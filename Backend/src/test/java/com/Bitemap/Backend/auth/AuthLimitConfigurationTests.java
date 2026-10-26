package com.Bitemap.Backend.auth;

import com.Bitemap.Backend.auth.limit.AuthLimitProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import static org.assertj.core.api.Assertions.*;

class AuthLimitConfigurationTests {
    @Configuration @EnableConfigurationProperties(AuthLimitProperties.class)
    static class Config {}
    private final ApplicationContextRunner context = new ApplicationContextRunner().withUserConfiguration(Config.class);
    @Test void secretIsRequiredAndDefaultPolicyIsBound() {
        context.run(c -> assertThat(c).hasFailed());
        context.withPropertyValues("bitemap.auth-limit.secret=isolated-test-secret-at-least-32-characters")
                .run(c -> {
                    assertThat(c).hasNotFailed();
                    var properties = c.getBean(AuthLimitProperties.class);
                    assertThat(properties.loginAccountCapacity()).isEqualTo(10);
                    assertThat(properties.loginAccountRefillSeconds()).isEqualTo(60);
                    assertThat(properties.loginIpCapacity()).isEqualTo(60);
                    assertThat(properties.loginIpRefillSeconds()).isEqualTo(5);
                    assertThat(properties.registrationIpCapacity()).isEqualTo(5);
                    assertThat(properties.registrationIpRefillSeconds()).isEqualTo(720);
                    assertThat(properties.toString()).doesNotContain(properties.secret());
                });
    }
    @Test void invalidPolicyCannotStart() {
        context.withPropertyValues("bitemap.auth-limit.secret=isolated-test-secret-at-least-32-characters",
                        "bitemap.auth-limit.login-ip-capacity=0")
                .run(c -> assertThat(c).hasFailed());
    }
}
