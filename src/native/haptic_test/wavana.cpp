// 分析 16-bit WAV：时长/声道、每声道包络(10ms窗RMS)找爆发点、爆发处主频(Goertzel)、低频占比。
#include <stdio.h>
#include <stdlib.h>
#include <math.h>
#include <string.h>
static const double PI = 3.14159265358979;

int main(int argc, char** argv) {
    if (argc < 2) { printf("usage: wavana file.wav\n"); return 2; }
    FILE* f = fopen(argv[1], "rb"); if (!f) { printf("open fail\n"); return 1; }
    fseek(f, 0, SEEK_END); long sz = ftell(f); fseek(f, 0, SEEK_SET);
    unsigned char* b = (unsigned char*)malloc(sz); fread(b, 1, sz, f); fclose(f);
    // 解析 chunk
    int rate = 0, ch = 0, bits = 0; long dataOff = 0, dataLen = 0;
    long p = 12;
    while (p + 8 <= sz) {
        char id[5] = {0}; memcpy(id, b + p, 4);
        unsigned len = *(unsigned*)(b + p + 4);
        if (!strcmp(id, "fmt ")) { ch = *(short*)(b+p+8+2); rate = *(int*)(b+p+8+4); bits = *(short*)(b+p+8+14); }
        else if (!strcmp(id, "data")) { dataOff = p + 8; dataLen = len; break; }
        p += 8 + len + (len & 1);
    }
    if (bits != 16 || ch < 1) { printf("need 16-bit PCM, got bits=%d ch=%d\n", bits, ch); return 1; }
    short* s = (short*)(b + dataOff);
    long n = dataLen / 2 / ch;   // frames
    printf("rate=%d ch=%d frames=%ld dur=%.3fs\n", rate, ch, n, (double)n / rate);

    int win = rate / 100;        // 10ms
    // 每声道：整体 peak/rms + 找爆发窗
    for (int c = 0; c < ch; ++c) {
        double peak = 0, sum2 = 0; long bestW = 0; double bestE = 0;
        for (long i = 0; i < n; ++i) { double v = s[i*ch+c] / 32768.0; double a = fabs(v); if (a > peak) peak = a; sum2 += v*v; }
        for (long w = 0; w + win <= n; w += win) { double e = 0; for (int i = 0; i < win; ++i) { double v = s[(w+i)*ch+c]/32768.0; e += v*v; } if (e > bestE) { bestE = e; bestW = w; } }
        double t = (double)bestW / rate;
        printf("ch%d: peak=%.3f rms=%.4f  爆发@%.3fs (窗rms=%.4f)\n", c, peak, sqrt(sum2/n), t, sqrt(bestE/win));
    }
    // 用整体最响声道，在爆发处 ±60ms 做频率扫描
    int hc = 0; { double best = 0; for (int c=0;c<ch;++c){ double e=0; for(long i=0;i<n;++i){ double v=s[i*ch+c]/32768.0; e+=v*v;} if(e>best){best=e;hc=c;} } }
    long bestW = 0; double bestE = 0;
    for (long w = 0; w + win <= n; w += win) { double e = 0; for (int i = 0; i < win; ++i) { double v = s[(w+i)*ch+hc]/32768.0; e += v*v; } if (e > bestE) { bestE = e; bestW = w; } }
    long a0 = bestW - rate*6/100; if (a0 < 0) a0 = 0;
    long a1 = bestW + rate*6/100; if (a1 > n) a1 = n;
    long m = a1 - a0;
    printf("\n主声道=ch%d，爆发窗 [%.3f, %.3f]s 频率扫描(Goertzel):\n", hc, (double)a0/rate, (double)a1/rate);
    double lowE = 0, allE = 0, bestF = 0, bestMag = 0;
    for (int hz = 20; hz <= 1200; hz += 10) {
        double wc = 2*PI*hz/rate, cr = cos(wc), coeff = 2*cr;
        double s0=0,s1=0,s2=0;
        for (long i = a0; i < a1; ++i) { double x = s[i*ch+hc]/32768.0; s0 = x + coeff*s1 - s2; s2 = s1; s1 = s0; }
        double mag = sqrt(s1*s1 + s2*s2 - coeff*s1*s2);
        allE += mag; if (hz <= 400) lowE += mag;
        if (mag > bestMag && hz >= 30) { bestMag = mag; bestF = hz; }
        if (hz <= 300 && (hz % 20 == 0)) printf("  %4dHz: %.1f\n", hz, mag);
    }
    printf(">> 主频≈%.0fHz   低频(<=400Hz)占比=%.1f%%\n", bestF, 100.0*lowE/allE);

    // 精细包络：每 5ms 窗的 rms（用主声道），画条形，数瞬态
    printf("\n=== 5ms 包络(主声道 ch%d) ===\n", hc);
    int w5 = rate/200;              // 5ms
    double gmax = 0;
    for (long w=0; w+w5<=n; w+=w5){ double e=0; for(int i=0;i<w5;i++){double v=s[(w+i)*ch+hc]/32768.0; e+=v*v;} double r=sqrt(e/w5); if(r>gmax)gmax=r; }
    for (long w=0; w+w5<=n; w+=w5){
        double e=0; for(int i=0;i<w5;i++){double v=s[(w+i)*ch+hc]/32768.0; e+=v*v;} double r=sqrt(e/w5);
        int bars=(int)(60*r/(gmax>0?gmax:1));
        printf("%6.3fs |", (double)w/rate); for(int k=0;k<bars;k++)putchar('#'); putchar('\n');
    }
    return 0;
}
