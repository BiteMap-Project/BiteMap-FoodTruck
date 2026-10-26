package com.Bitemap.Backend.auth.limit;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableScheduling
@EnableConfigurationProperties(AuthLimitProperties.class)
class AuthLimitConfiguration {}
