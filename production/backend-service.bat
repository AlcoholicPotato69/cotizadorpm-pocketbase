@echo off
rem Wrapper de compatibilidad — la implementacion vive en production\deploy\
call "%~dp0deploy\backend-service.bat" %*
