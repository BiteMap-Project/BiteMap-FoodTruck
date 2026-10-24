package com.Bitemap.Backend.menu;

import java.awt.Color;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Semaphore;
import java.util.zip.CRC32;
import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.stream.MemoryCacheImageInputStream;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import org.springframework.stereotype.Component;

/** Bounded raster decoding. Original bytes, profiles, comments and filenames are never stored. */
@Component
public class MenuImageNormalizer {
    static final int MAX_BYTES = 2 * 1024 * 1024;
    static final int MAX_SIDE = 6000;
    static final long MAX_PIXELS = 12_000_000;
    static final int OUTPUT_SIDE = 1600;
    private static final String INVALID = "Choose a valid, non-animated JPEG, PNG or WebP image.";
    // Bound aggregate decoding memory per JVM; this is not a distributed rate limiter.
    private final Semaphore decoders = new Semaphore(2);

    public byte[] normalize(byte[] bytes, String claimedType) {
        if (bytes == null || bytes.length == 0 || bytes.length > MAX_BYTES) {
            throw new InvalidMenuImageException("Choose an image no larger than 2 MB.");
        }
        String format = format(bytes);
        String expected = switch (format) { case "jpeg" -> "image/jpeg"; case "png" -> "image/png"; default -> "image/webp"; };
        if (!expected.equals(claimedType)) throw invalid();
        if (!decoders.tryAcquire()) throw new ImageProcessingBusyException();
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReadersByFormatName(format);
            if (!readers.hasNext()) throw new IllegalStateException("Configured image decoder unavailable");
            var reader = readers.next();
            try {
                reader.setInput(input, true, true); // Ignore source metadata.
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || width > MAX_SIDE || height > MAX_SIDE
                        || (long) width * height > MAX_PIXELS) {
                    throw new InvalidMenuImageException("Image must be at most 6000 pixels per side and 12 megapixels in total.");
                }
                reader.addIIOReadWarningListener((source, warning) -> { throw invalid(); });
                var source = reader.read(0);
                if (source == null || source.getWidth() != width || source.getHeight() != height) throw invalid();
                try { return encode(source); } finally { source.flush(); }
            } finally { reader.dispose(); }
        } catch (InvalidMenuImageException error) {
            throw error;
        } catch (IOException | IllegalArgumentException | IndexOutOfBoundsException error) {
            throw invalid(); // Never return parser internals or uploaded content.
        } finally { decoders.release(); }
    }

    private byte[] encode(BufferedImage source) throws IOException {
        double scale = Math.min(1d, (double) OUTPUT_SIDE / Math.max(source.getWidth(), source.getHeight()));
        int width = Math.max(1, (int) Math.round(source.getWidth() * scale));
        int height = Math.max(1, (int) Math.round(source.getHeight() * scale));
        var clean = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        var graphics = clean.createGraphics();
        try {
            graphics.setColor(Color.WHITE);
            graphics.fillRect(0, 0, width, height);
            graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            graphics.drawImage(source, 0, 0, width, height, null);
        } finally { graphics.dispose(); }
        var writer = ImageIO.getImageWritersByFormatName("jpeg").next();
        // A 1600px RGB raster is bounded; cap encoded output as a separate storage constraint.
        var bytes = new ByteArrayOutputStream();
        try (var output = new MemoryCacheImageOutputStream(bytes)) {
            writer.setOutput(output);
            var options = writer.getDefaultWriteParam();
            options.setCompressionMode(ImageWriteParam.MODE_EXPLICIT);
            options.setCompressionQuality(0.85f);
            writer.write(null, new IIOImage(clean, null, null), options);
            output.flush();
            if (bytes.size() > MAX_BYTES) throw new InvalidMenuImageException("Processed image is too large. Choose a smaller photo.");
            return bytes.toByteArray();
        } finally { writer.dispose(); clean.flush(); }
    }

    // Check container completeness before decoding: ImageIO can tolerate truncated streams.
    private String format(byte[] bytes) {
        if (bytes.length >= 4 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216) {
            if ((bytes[bytes.length - 2] & 255) != 255 || (bytes[bytes.length - 1] & 255) != 217) throw invalid();
            return "jpeg";
        }
        if (bytes.length >= 8 && ByteBuffer.wrap(bytes).getLong() == 0x89504e470d0a1a0aL) {
            int offset = 8;
            boolean end = false;
            while (offset <= bytes.length - 12) {
                long length = Integer.toUnsignedLong(ByteBuffer.wrap(bytes, offset, 4).getInt());
                if (length > bytes.length - offset - 12) throw invalid();
                int size = (int) length;
                String type = new String(bytes, offset + 4, 4, StandardCharsets.US_ASCII);
                if (type.equals("acTL")) throw invalid();
                var crc = new CRC32();
                crc.update(bytes, offset + 4, size + 4);
                long saved = Integer.toUnsignedLong(ByteBuffer.wrap(bytes, offset + 8 + size, 4).getInt());
                if (crc.getValue() != saved) throw invalid();
                offset += size + 12;
                if (type.equals("IEND")) { if (size != 0) throw invalid(); end = true; break; }
            }
            if (!end || offset != bytes.length) throw invalid();
            return "png";
        }
        if (bytes.length >= 12 && ascii(bytes, 0).equals("RIFF") && ascii(bytes, 8).equals("WEBP")) {
            long size = Integer.toUnsignedLong(ByteBuffer.wrap(bytes, 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt());
            if (size + 8 != bytes.length) throw invalid();
            int offset = 12;
            while (offset <= bytes.length - 8) {
                String type = ascii(bytes, offset);
                long length = Integer.toUnsignedLong(ByteBuffer.wrap(bytes, offset + 4, 4).order(ByteOrder.LITTLE_ENDIAN).getInt());
                if (length > bytes.length - offset - 8) throw invalid();
                if (type.equals("ANIM") || type.equals("ANMF") || (type.equals("VP8X") && length > 0 && (bytes[offset + 8] & 2) != 0)) throw invalid();
                offset += 8 + (int) length + (int) (length & 1);
            }
            if (offset != bytes.length) throw invalid();
            return "webp";
        }
        throw invalid();
    }

    private static String ascii(byte[] bytes, int offset) { return new String(bytes, offset, 4, StandardCharsets.US_ASCII); }
    private static InvalidMenuImageException invalid() { return new InvalidMenuImageException(INVALID); }
    static class ImageProcessingBusyException extends RuntimeException {}
}
