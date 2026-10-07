package com.Bitemap.Backend.location.management;

import java.time.Clock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class ScheduleClockConfiguration {
    @Bean Clock scheduleClock() { return Clock.systemUTC(); }
}
