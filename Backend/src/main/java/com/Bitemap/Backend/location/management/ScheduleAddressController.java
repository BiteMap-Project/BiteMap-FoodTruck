package com.Bitemap.Backend.location.management;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.ObjectMapper;

// /api/operator/** already requires an active OPERATOR session in this project.
@RestController
@RequestMapping("/api/operator/schedule-addresses")
public class ScheduleAddressController {
    private final ObjectMapper json;
    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5)).build();

    public ScheduleAddressController(ObjectMapper json) {
        this.json = json;
    }

    public record Match(String address, double latitude, double longitude) {}

    @GetMapping
    public ResponseEntity<List<Match>> search(@RequestParam String street,
            @RequestParam String city, @RequestParam String state,
            @RequestParam(defaultValue = "") String zip,
            @RequestParam(defaultValue = "US") String country) {
        street = street.strip();
        city = city.strip();
        state = state.strip().toUpperCase(Locale.ROOT);
        zip = zip.strip();
        if (!country.equals("US") || street.isBlank() || street.length() > 100
                || city.isBlank() || city.length() > 60 || !state.matches("[A-Z]{2}")
                || (!zip.isEmpty() && !zip.matches("[0-9]{5}(-[0-9]{4})?"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Enter a U.S. street, city, two-letter state and optional ZIP code.");
        }
        var uri = URI.create("https://geocoding.geo.census.gov/geocoder/locations/address"
                + "?benchmark=Public_AR_Current&format=json&street=" + encode(street)
                + "&city=" + encode(city) + "&state=" + encode(state) + "&zip=" + encode(zip));
        var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(10))
                .header("Accept", "application/json").GET().build();
        try {
            var response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new IllegalStateException();
            var matches = json.readTree(response.body()).path("result").path("addressMatches");
            if (!matches.isArray()) throw new IllegalStateException();
            var results = new ArrayList<Match>();
            for (var match : matches) {
                String label = match.path("matchedAddress").asText("");
                var x = match.path("coordinates").path("x");
                var y = match.path("coordinates").path("y");
                if (!x.isNumber() || !y.isNumber() || label.isBlank() || label.length() > 300) continue;
                double latitude = y.doubleValue(), longitude = x.doubleValue();
                if (Double.isFinite(latitude) && Double.isFinite(longitude)
                        && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
                    results.add(new Match(label, latitude, longitude));
                }
                if (results.size() == 5) break;
            }
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(results);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw unavailable();
        } catch (Exception error) {
            throw unavailable();
        }
    }

    @ExceptionHandler(ResponseStatusException.class)
    ProblemDetail problem(ResponseStatusException error) {
        return ProblemDetail.forStatusAndDetail(error.getStatusCode(), error.getReason());
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Address lookup is temporarily unavailable. Please try again.");
    }
}
