package com.Bitemap.Backend.menu;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Base64;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class MenuImageNormalizerTests {
    private final MenuImageNormalizer images = new MenuImageNormalizer();

    static byte[] picture(String format, int width, int height) throws Exception {
        var image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        image.setRGB(0, 0, 0xffbb4411);
        var output = new ByteArrayOutputStream();
        assertThat(ImageIO.write(image, format, output)).isTrue();
        image.flush();
        return output.toByteArray();
    }

    @Test void decodesRealPngJpegAndWebpAndWritesFreshJpeg() throws Exception {
        byte[] webp = Base64.getDecoder().decode("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");
        for (var fixture : java.util.Map.of("image/png", picture("png", 2, 2), "image/jpeg", picture("jpeg", 2, 2), "image/webp", webp).entrySet()) {
            var output = images.normalize(fixture.getValue(), fixture.getKey());
            assertThat(output[0] & 255).isEqualTo(255);
            assertThat(output[1] & 255).isEqualTo(216);
            assertThat(ImageIO.read(new ByteArrayInputStream(output))).isNotNull();
        }
    }

    @Test void rejectsSpoofedTypesEmptyMissingAndUnsupportedImages() throws Exception {
        byte[] png = picture("png", 2, 2);
        for (String claimed : new String[] {null, "image/jpeg", "text/plain", "image/svg+xml"}) {
            assertThatThrownBy(() -> images.normalize(png, claimed)).isInstanceOf(InvalidMenuImageException.class);
        }
        for (byte[] bytes : new byte[][] {null, new byte[0], new byte[] {1}, "<svg/>".getBytes(), picture("gif", 2, 2), new byte[2 * 1024 * 1024 + 1]}) {
            assertThatThrownBy(() -> images.normalize(bytes, "image/png")).isInstanceOf(InvalidMenuImageException.class);
        }
    }

    @Test void rejectsTruncationAndBadPngCrc() throws Exception {
        for (String format : new String[] {"png", "jpeg"}) {
            var valid = picture(format, 10, 10);
            var truncated = Arrays.copyOf(valid, valid.length - 5);
            assertThatThrownBy(() -> images.normalize(truncated, "image/" + format)).isInstanceOf(InvalidMenuImageException.class);
        }
        byte[] corrupt = picture("png", 3, 3);
        corrupt[29] ^= 1;
        assertThatThrownBy(() -> images.normalize(corrupt, "image/png")).isInstanceOf(InvalidMenuImageException.class);
    }

    @Test void rejectsDimensionsAndPixelBombsBeforeRasterAllocation() throws Exception {
        for (int[] size : new int[][] {{6001, 1}, {1, 6001}, {4000, 4000}, {Integer.MAX_VALUE, Integer.MAX_VALUE}}) {
            byte[] png = picture("png", 1, 1);
            ByteBuffer.wrap(png, 16, 8).putInt(size[0]).putInt(size[1]);
            var crc = new CRC32(); crc.update(png, 12, 17);
            ByteBuffer.wrap(png, 29, 4).putInt((int) crc.getValue());
            assertThatThrownBy(() -> images.normalize(png, "image/png")).isInstanceOf(InvalidMenuImageException.class)
                    .hasMessageContaining("12 megapixels");
        }
    }

    @Test void stripsSourceMetadataAndResizesWhilePreservingAspectRatio() throws Exception {
        byte[] png = picture("png", 2000, 1000);
        byte[] tagged = addChunk(png, "tEXt", "Comment\0PRIVATE_LOCATION_METADATA".getBytes(StandardCharsets.US_ASCII));
        var output = images.normalize(tagged, "image/png");
        assertThat(new String(output, StandardCharsets.ISO_8859_1)).doesNotContain("PRIVATE_LOCATION_METADATA");
        var decoded = ImageIO.read(new ByteArrayInputStream(output));
        assertThat(decoded.getWidth()).isEqualTo(1600);
        assertThat(decoded.getHeight()).isEqualTo(800);
        assertThat(output.length).isLessThanOrEqualTo(MenuImageNormalizer.MAX_BYTES);
    }

    @Test void rejectsAnimatedPng() throws Exception {
        var animated = addChunk(picture("png", 1, 1), "acTL", ByteBuffer.allocate(8).putInt(2).putInt(0).array());
        assertThatThrownBy(() -> images.normalize(animated, "image/png")).isInstanceOf(InvalidMenuImageException.class);
    }

    private static byte[] addChunk(byte[] png, String type, byte[] content) throws Exception {
        var output = new ByteArrayOutputStream();
        output.write(png, 0, 33);
        output.write(ByteBuffer.allocate(4).putInt(content.length).array());
        byte[] name = type.getBytes(StandardCharsets.US_ASCII);
        output.write(name); output.write(content);
        var crc = new CRC32(); crc.update(name); crc.update(content);
        output.write(ByteBuffer.allocate(4).putInt((int) crc.getValue()).array());
        output.write(png, 33, png.length - 33);
        return output.toByteArray();
    }
}
