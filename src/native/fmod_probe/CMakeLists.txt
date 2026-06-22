cmake_minimum_required(VERSION 3.15)
project(fmod_probe CXX)

# 必须 64 位（只狼是 x64，fmodex64.dll 也是 x64）
add_library(fmodex64 SHARED dllmain.cpp)

# 输出文件名固定为 fmodex64.dll
set_target_properties(fmodex64 PROPERTIES
    OUTPUT_NAME "fmodex64"
    PREFIX "")

# 用 .def 控制导出：706 个转发 + 3 个拦截
target_link_options(fmodex64 PRIVATE
    "/DEF:${CMAKE_CURRENT_SOURCE_DIR}/fmodex64.def")

set_property(TARGET fmodex64 PROPERTY CXX_STANDARD 17)

# 构建示例：
#   cmake -B build -A x64
#   cmake --build build --config Release
# 产物：build/Release/fmodex64.dll
