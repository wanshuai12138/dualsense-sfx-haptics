// 把一个单声道 16-bit WAV 播到 DualSense ch3/4(触觉音圈)，重复几遍带间隔，用于直接感受某段触觉波形。
// 用法: playclip.exe <file.wav> [gain] [repeats] [gapMs]
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <ksmedia.h>
#include <avrt.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <vector>
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "avrt.lib")

const PROPERTYKEY PK_DevFmt = { {0xf19f064d,0x082c,0x4e27,{0xbc,0x73,0x68,0x82,0xa1,0xbb,0x8e,0x4c}}, 0 };
#define CK(hr, msg) do{ if(FAILED(hr)){ printf("FAIL %s hr=0x%08lx\n", msg, (unsigned long)hr); return 1; } }while(0)

// 读单声道/立体声 16-bit WAV -> mono float 向量
static bool loadWavMono(const char* path, std::vector<float>& out, int& srcRate) {
    FILE* f = fopen(path, "rb"); if (!f) return false;
    fseek(f, 0, SEEK_END); long sz = ftell(f); fseek(f, 0, SEEK_SET);
    unsigned char* b = (unsigned char*)malloc(sz); fread(b, 1, sz, f); fclose(f);
    int rate=0, ch=0, bits=0; long dataOff=0, dataLen=0, p=12;
    while (p + 8 <= sz) {
        char id[5]={0}; memcpy(id,b+p,4); unsigned len=*(unsigned*)(b+p+4);
        if (!strcmp(id,"fmt ")) { ch=*(short*)(b+p+8+2); rate=*(int*)(b+p+8+4); bits=*(short*)(b+p+8+14); }
        else if (!strcmp(id,"data")) { dataOff=p+8; dataLen=len; break; }
        p += 8 + len + (len&1);
    }
    if (bits!=16 || ch<1) { free(b); return false; }
    short* s = (short*)(b+dataOff); long n = dataLen/2/ch;
    out.resize(n);
    for (long i=0;i<n;i++) { double acc=0; for(int c=0;c<ch;c++) acc+=s[i*ch+c]/32768.0; out[i]=(float)(acc/ch); }
    srcRate = rate; free(b); return true;
}

int main(int argc, char** argv) {
    if (argc < 2) { printf("usage: playclip <file.wav> [gain=1.0] [repeats=5] [gapMs=600]\n"); return 2; }
    double gain = argc>2 ? atof(argv[2]) : 1.0;
    int repeats = argc>3 ? atoi(argv[3]) : 5;
    int gapMs   = argc>4 ? atoi(argv[4]) : 600;

    std::vector<float> clip; int srcRate=0;
    if (!loadWavMono(argv[1], clip, srcRate)) { printf("!! 读 WAV 失败(需16-bit)\n"); return 1; }
    printf(">> 加载 %s: %zu 帧 @%dHz (%.3fs), gain=%.2f x%d\n", argv[1], clip.size(), srcRate, clip.size()/(double)srcRate, gain, repeats);

    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    IMMDeviceEnumerator* en=nullptr;
    CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void**)&en);
    IMMDeviceCollection* col=nullptr; en->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &col);
    UINT n=0; col->GetCount(&n); IMMDevice* dsdev=nullptr;
    for (UINT i=0;i<n;i++){ IMMDevice* d=nullptr; col->Item(i,&d);
        IPropertyStore* ps=nullptr; d->OpenPropertyStore(STGM_READ,&ps);
        PROPVARIANT nm; PropVariantInit(&nm); ps->GetValue(PKEY_Device_FriendlyName,&nm);
        char nb[512]=""; if(nm.vt==VT_LPWSTR) WideCharToMultiByte(CP_UTF8,0,nm.pwszVal,-1,nb,sizeof(nb),0,0);
        if(!dsdev && strstr(nb,"DualSense")){ dsdev=d; d->AddRef(); printf(">> 选中: %s\n", nb); }
        PropVariantClear(&nm); ps->Release(); d->Release();
    }
    col->Release();
    if(!dsdev){ printf("!! 没找到激活的 DualSense 渲染端点(确认USB连接、且没被DSX/其它程序独占)\n"); return 1; }

    IAudioClient* ac=nullptr; CK(dsdev->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,(void**)&ac),"Activate");
    IPropertyStore* ps=nullptr; dsdev->OpenPropertyStore(STGM_READ,&ps);
    PROPVARIANT df; PropVariantInit(&df); ps->GetValue(PK_DevFmt,&df);
    if(!(df.vt==VT_BLOB && df.blob.cbSize>=sizeof(WAVEFORMATEX))){ printf("!! 读不到 DeviceFormat\n"); return 1; }
    WAVEFORMATEX* pfmt=(WAVEFORMATEX*)malloc(df.blob.cbSize); memcpy(pfmt,df.blob.pBlobData,df.blob.cbSize);
    PropVariantClear(&df); ps->Release();
    const int CH=pfmt->nChannels, RATE=pfmt->nSamplesPerSec;
    int hapL=(CH>=4)?2:0, hapR=(CH>=4)?3:(CH-1);
    printf(">> DeviceFormat ch=%d rate=%d bits=%u, 触觉ch=%d/%d\n", CH, RATE, pfmt->wBitsPerSample, hapL+1, hapR+1);

    REFERENCE_TIME defP=0,minP=0; ac->GetDevicePeriod(&defP,&minP);
    REFERENCE_TIME dur=defP;
    HRESULT hr=ac->Initialize(AUDCLNT_SHAREMODE_EXCLUSIVE, AUDCLNT_STREAMFLAGS_EVENTCALLBACK, dur, dur, pfmt, nullptr);
    if(hr==AUDCLNT_E_BUFFER_SIZE_NOT_ALIGNED){ UINT32 fr=0; ac->GetBufferSize(&fr);
        dur=(REFERENCE_TIME)(10000.0*1000/RATE*fr+0.5);
        ac->Release(); dsdev->Activate(__uuidof(IAudioClient),CLSCTX_ALL,nullptr,(void**)&ac);
        hr=ac->Initialize(AUDCLNT_SHAREMODE_EXCLUSIVE, AUDCLNT_STREAMFLAGS_EVENTCALLBACK, dur, dur, pfmt, nullptr);
    }
    CK(hr,"Initialize");
    HANDLE evt=CreateEvent(nullptr,FALSE,FALSE,nullptr); ac->SetEventHandle(evt);
    UINT32 bufFrames=0; ac->GetBufferSize(&bufFrames);
    IAudioRenderClient* rc=nullptr; CK(ac->GetService(__uuidof(IAudioRenderClient),(void**)&rc),"GetService");

    // 简单重采样：源速率 -> 设备速率(通常都是48k，比例=1)
    double step = (double)srcRate / RATE;
    DWORD taskIdx=0; AvSetMmThreadCharacteristicsW(L"Pro Audio",&taskIdx);
    BYTE* p=nullptr; if(SUCCEEDED(rc->GetBuffer(bufFrames,&p))) rc->ReleaseBuffer(bufFrames,AUDCLNT_BUFFERFLAGS_SILENT);
    ac->Start();

    int rep=0; double pos=0; bool inGap=true; int gapFrames=RATE/1000*300; bool done=false;
    int guardFrames = RATE*60;
    while(!done && guardFrames>0){
        if(WaitForSingleObject(evt,2000)!=WAIT_OBJECT_0) break;
        UINT32 pad=0; ac->GetCurrentPadding(&pad); UINT32 avail=bufFrames-pad; if(!avail) continue;
        if(FAILED(rc->GetBuffer(avail,&p))) break;
        short* out=(short*)p;
        for(UINT32 i=0;i<avail;i++){
            short v=0;
            if(inGap){ if(--gapFrames<=0){ if(rep>=repeats){done=true;} else {inGap=false; pos=0;} } }
            else {
                long idx=(long)pos;
                if(idx>=(long)clip.size()){ inGap=true; gapFrames=RATE/1000*gapMs; rep++; }
                else { double s=clip[idx]*gain; if(s>1)s=1; if(s<-1)s=-1; v=(short)(s*32767.0); pos+=step; }
            }
            for(int c=0;c<CH;c++) out[i*CH+c]=(c==hapL||c==hapR)?v:0;
            guardFrames--;
        }
        rc->ReleaseBuffer(avail,0);
    }
    ac->Stop();
    printf(">> 播放结束\n");
    rc->Release(); CloseHandle(evt); ac->Release(); dsdev->Release(); en->Release(); CoUninitialize();
    return 0;
}
