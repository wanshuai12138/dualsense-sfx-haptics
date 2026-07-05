#pragma once
// 细腻触觉/手柄喇叭输出：DualSense ch1/2 可播放短提示音，ch3/4 驱动触觉音圈。
// 渲染线程通过 haptic_pull_audio() 拉取 speaker L/R + haptic L/R 四路波形。
extern "C" void haptic_out_start();                 // 启动渲染线程（幂等）
extern "C" int  haptic_pull_audio(float* speakerL, float* speakerR, float* hapticL, float* hapticR, int n); // 由 dllmain 实现，返回 1/0
