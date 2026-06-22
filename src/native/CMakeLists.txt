cmake_minimum_required(VERSION 3.10)
project(dualsense_hook)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Platform-specific settings
if(WIN32)
  set(PLATFORM_LIBS dsound dxguid)
else()
  message(FATAL_ERROR "This project currently supports Windows only")
endif()

# Find minhook (assume it's in external/minhook or system)
find_package(minhook QUIET)
if(NOT minhook_FOUND)
  # Fallback: assume minhook is in external directory
  if(EXISTS "${CMAKE_SOURCE_DIR}/external/minhook")
    set(MINHOOK_INCLUDE_DIR "${CMAKE_SOURCE_DIR}/external/minhook/include")
    set(MINHOOK_LIB_DIR "${CMAKE_SOURCE_DIR}/external/minhook/lib")
  else()
    message(WARNING "minhook not found. Please install or set MINHOOK_INCLUDE_DIR and MINHOOK_LIB_DIR")
  endif()
endif()

# Source files
set(SOURCES
  directsound_hook.cpp
)

# Create shared library
add_library(dualsense_hook SHARED ${SOURCES})

# Include directories
target_include_directories(dualsense_hook PRIVATE
  ${MINHOOK_INCLUDE_DIR}
  ${CMAKE_CURRENT_SOURCE_DIR}
)

# Link libraries
target_link_libraries(dualsense_hook
  ${PLATFORM_LIBS}
  ${MINHOOK_LIB_DIR}/minhook.lib
)

# Output directory
set_target_properties(dualsense_hook PROPERTIES
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/lib"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)
