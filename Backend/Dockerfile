FROM eclipse-temurin:21-jdk-jammy AS build
WORKDIR /app
COPY . .
RUN chmod +x mvnw && ./mvnw --batch-mode --no-transfer-progress -DskipTests package

FROM eclipse-temurin:21-jre-jammy AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 bitemap \
    && useradd --uid 10001 --gid bitemap --no-create-home bitemap
WORKDIR /app
COPY --from=build --chown=bitemap:bitemap /app/target/Backend-0.0.1-SNAPSHOT.jar app.jar
USER bitemap
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
