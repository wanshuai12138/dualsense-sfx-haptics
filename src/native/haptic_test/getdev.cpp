// 按端点 ID 直接 GetDevice，读格式 + 测独占/共享是否可初始化。
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <stdio.h>
#pragma comment(lib,"ole32.lib")
const PROPERTYKEY PK_DevFmt = { {0xf19f064d,0x082c,0x4e27,{0xbc,0x73,0x68,0x82,0xa1,0xbb,0x8e,0x4c}}, 0 };

int main(int argc, char** argv) {
    if (argc < 2) { printf("usage: getdev <endpointID>\n"); return 2; }
    wchar_t id[256]; MultiByteToWideChar(CP_ACP, 0, argv[1], -1, id, 256);
    CoInitializeEx(nullptr, COINIT_MULTITHREADED);
    IMMDeviceEnumerator* en = nullptr;
    CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void**)&en);
    IMMDevice* dev = nullptr;
    HRESULT hr = en->GetDevice(id, &dev);
    printf("GetDevice hr=0x%08lx dev=%p\n", (unsigned long)hr, (void*)dev);
    if (FAILED(hr) || !dev) return 1;
    DWORD st = 0; dev->GetState(&st); printf("state=%lu\n", st);
    IPropertyStore* ps = nullptr; dev->OpenPropertyStore(STGM_READ, &ps);
    PROPVARIANT nm; PropVariantInit(&nm); ps->GetValue(PKEY_Device_FriendlyName, &nm);
    char nb[512]=""; if(nm.vt==VT_LPWSTR) WideCharToMultiByte(CP_UTF8,0,nm.pwszVal,-1,nb,sizeof(nb),0,0);
    printf("name=%s\n", nb);
    PROPVARIANT df; PropVariantInit(&df); ps->GetValue(PK_DevFmt, &df);
    if (df.vt==VT_BLOB && df.blob.cbSize>=sizeof(WAVEFORMATEX)) {
        WAVEFORMATEX* f=(WAVEFORMATEX*)df.blob.pBlobData;
        printf("DeviceFormat: ch=%u rate=%lu bits=%u tag=0x%04x cb=%u\n", f->nChannels, f->nSamplesPerSec, f->wBitsPerSample, f->wFormatTag, f->cbSize);
    } else printf("no DeviceFormat blob\n");
    IAudioClient* ac=nullptr;
    if (SUCCEEDED(dev->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&ac)) && ac) {
        WAVEFORMATEX* mix=nullptr; ac->GetMixFormat(&mix);
        if (mix) printf("MixFormat(shared): ch=%u rate=%lu bits=%u tag=0x%04x\n", mix->nChannels, mix->nSamplesPerSec, mix->wBitsPerSample, mix->wFormatTag);
        if (df.vt==VT_BLOB) { HRESULT e=ac->IsFormatSupported(AUDCLNT_SHAREMODE_EXCLUSIVE,(WAVEFORMATEX*)df.blob.pBlobData,nullptr); printf("EXCLUSIVE(deviceFmt) -> 0x%08lx\n",(unsigned long)e); }
        ac->Release();
    } else printf("Activate failed\n");
    return 0;
}
