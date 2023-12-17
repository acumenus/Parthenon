#!/bin/bash
 
# Install CMake
sudo apt-get update
sudo apt-get install cmake
 
# Install GCC and G++
sudo apt-get install gcc
sudo apt-get install g++
 
# Install Fortran
sudo apt-get install gfortran
 
# Install OpenJDK 8 and OpenJRE 8 + OpenJDK 11 and OpenJRE 11
sudo apt-get update
sudo apt-get install -y openjdk-8-jdk openjdk-8-jre
sudo apt-get install -y openjdk-11-jdk openjdk-11-jre

# Set the JAVA_HOME environment variable
echo "export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64" >> ~/.bashrc
 
# Add JAVA_HOME to PATH
echo "export PATH=\$PATH:\$JAVA_HOME/bin" >> ~/.bashrc
 
# Reload the shell environment
source ~/.bashrc
