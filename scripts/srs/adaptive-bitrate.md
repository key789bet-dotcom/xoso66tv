# 📺 Mục 7: Adaptive Bitrate Streaming Setup

## Mục tiêu

Khi BLV/Idol push 1080p → SRS tự transcode thành 3 variants:
- **1080p** (high) - 4500 Kbps
- **720p**  (medium) - 2500 Kbps
- **480p**  (low) - 1000 Kbps

HLS.js client tự chọn quality theo bandwidth user (4G/3G/Wifi).

## Setup SRS với FFmpeg transcoding

### 1. Vào SRS container

```bash
docker exec -it srs bash
```

### 2. Update srs.conf với transcoding block

Add vào `/usr/local/srs/conf/srs.conf` trong `vhost __defaultVhost__`:

```nginx
vhost __defaultVhost__ {
    # ... existing config ...

    transcode {
        enabled on;
        ffmpeg ./objs/ffmpeg/bin/ffmpeg;

        # Variant 720p
        engine 720p {
            enabled on;
            iformat flv;
            vfilter {
                vf "scale=-2:720";
            }
            vcodec libx264;
            vbitrate 2500;
            vfps 30;
            vwidth 1280;
            vheight 720;
            vthreads 4;
            vprofile main;
            vpreset veryfast;
            vparams { }
            acodec aac;
            abitrate 128;
            asample_rate 44100;
            achannels 2;
            aparams { }
            oformat flv;
            output rtmp://127.0.0.1:[port]/[app]/[stream]_720;
        }

        # Variant 480p
        engine 480p {
            enabled on;
            iformat flv;
            vfilter { vf "scale=-2:480"; }
            vcodec libx264;
            vbitrate 1000;
            vfps 25;
            vwidth 854;
            vheight 480;
            vthreads 2;
            vprofile baseline;
            vpreset veryfast;
            vparams { }
            acodec aac;
            abitrate 96;
            asample_rate 44100;
            achannels 2;
            aparams { }
            oformat flv;
            output rtmp://127.0.0.1:[port]/[app]/[stream]_480;
        }
    }

    hls {
        enabled on;
        hls_path ./objs/nginx/html;
        hls_fragment 2;
        hls_window 10;
        # Multi-variant: tạo master.m3u8 từ 3 streams
        hls_m3u8_file [app]/[stream].m3u8;
        hls_ts_file [app]/[stream]-[seq].ts;
    }
}
```

### 3. Reload SRS

```bash
docker exec srs ./objs/srs -s reload -c conf/srs.conf
```

### 4. Verify

OBS push 1080p stream → SRS sẽ tự tạo:
- Original: `https://live.xoso66tv.com/live/<key>.m3u8` (1080p)
- 720p:     `https://live.xoso66tv.com/live/<key>_720.m3u8`
- 480p:     `https://live.xoso66tv.com/live/<key>_480.m3u8`

### 5. HLS.js client auto adaptive (đã sẵn)

HLS.js mặc định auto-pick variant theo bandwidth. Nếu muốn master playlist:

Tạo file `master.m3u8` cho mỗi stream:
```
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=4500000,RESOLUTION=1920x1080
i_yennhi.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720
i_yennhi_720.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=854x480
i_yennhi_480.m3u8
```

## CPU note

Transcoding 1080p → 720p + 480p tốn ~30% CPU per stream. Với 4-core VPS:
- 1-2 streams cùng lúc: OK
- 3+ streams: cần upgrade CPU hoặc disable variant cao
