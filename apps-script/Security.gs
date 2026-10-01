const SecurityService = (() => {
  function randomSalt_() {
    return (Utilities.getUuid() + Utilities.getUuid() + String(Date.now())).replace(/-/g, '');
  }

  function hash_(password, salt) {
    const pepper = AppConfig.passwordPepper();
    let value = String(password) + ':' + salt + ':' + pepper;
    for (let i = 0; i < 2048; i++) {
      const digest = Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        value,
        Utilities.Charset.UTF_8
      );
      value = digest
        .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2))
        .join('');
    }
    return value;
  }

  function constantTimeEquals_(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (left.length !== right.length) return false;
    let diff = 0;
    for (let i = 0; i < left.length; i++) {
      diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
    }
    return diff === 0;
  }

  function makePassword(password) {
    if (!password || String(password).length < 8) {
      throw new Error('A senha deve possuir pelo menos 8 caracteres.');
    }
    const salt = randomSalt_();
    return { salt, hash: hash_(String(password), salt) };
  }

  function verify(password, salt, expectedHash) {
    return constantTimeEquals_(
      hash_(String(password || ''), String(salt || '')),
      String(expectedHash || '')
    );
  }

  return { makePassword, verify };
})();
