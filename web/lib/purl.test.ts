import { describe, it, expect } from 'vitest';
import { parsePurl, ecosystemFor } from './purl';

describe('parsePurl', () => {
  it('parses an OS (deb) package with namespace + complex version', () => {
    const p = parsePurl('pkg:deb/debian/openssl@1.1.1n-0+deb11u5?arch=amd64');
    expect(p).toMatchObject({ type: 'deb', namespace: 'debian', name: 'openssl', version: '1.1.1n-0+deb11u5' });
  });
  it('parses a language (npm) package without namespace', () => {
    expect(parsePurl('pkg:npm/lodash@4.17.20')).toMatchObject({ type: 'npm', namespace: null, name: 'lodash', version: '4.17.20' });
  });
  it('parses a maven package with a dotted namespace', () => {
    expect(parsePurl('pkg:maven/org.apache.commons/commons-text@1.9')).toMatchObject({
      type: 'maven', namespace: 'org.apache.commons', name: 'commons-text', version: '1.9',
    });
  });
  it('strips qualifiers and subpath', () => {
    const p = parsePurl('pkg:apk/alpine/libcrypto3@3.3.2-r0?arch=aarch64&distro=3.20.3');
    expect(p).toMatchObject({ type: 'apk', namespace: 'alpine', name: 'libcrypto3', version: '3.3.2-r0' });
  });
  it('rejects non-purls', () => {
    expect(parsePurl('not-a-purl')).toBeNull();
    expect(parsePurl('')).toBeNull();
  });
});

describe('ecosystemFor', () => {
  it('maps language types to mitre ecosystems', () => {
    expect(ecosystemFor(parsePurl('pkg:npm/lodash@1')!)).toBe('npm');
    expect(ecosystemFor(parsePurl('pkg:pypi/django@1')!)).toBe('pypi');
    expect(ecosystemFor(parsePurl('pkg:gem/rails@1')!)).toBe('rubygems');
    expect(ecosystemFor(parsePurl('pkg:golang/x/y@1')!)).toBe('go');
  });
  it('maps OS types to the distro namespace', () => {
    expect(ecosystemFor(parsePurl('pkg:deb/debian/openssl@1')!)).toBe('debian');
    expect(ecosystemFor(parsePurl('pkg:deb/ubuntu/curl@1')!)).toBe('ubuntu');
    expect(ecosystemFor(parsePurl('pkg:apk/alpine/musl@1')!)).toBe('alpine');
  });
});
