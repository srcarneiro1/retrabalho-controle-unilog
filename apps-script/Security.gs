const SecurityService = (() => {
  function randomHex_(bytes) {
    const values = [];
    for (let i = 0; i < bytes; i++) values.push(('0' + Math.floor(Math.random() * 256).toString(16)).slice(-2));
    return values.join('');
  }

  function hash_(password, salt) {
    const pepper = AppConfig.passwordPepper();
    let value = String(password) + ':' + salt + ':' + pepper;
    for (let i = 0; i < 2048; i++) {
      const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
      value = digest.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
    }
    return value;
  }

  function makePassword(password) {
    if (!password || String(password).length < 8) throw new Error('A senha deve possuir pelo menos 8 caracteres.');
    const salt = randomHex_(16);
    return { salt, hash: hash_(String(password), salt) };
  }

  function verify(password, salt, expectedHash) {
    return hash_(String(password || ''), String(salt || '')) === String(expectedHash || '');
  }

  return { makePassword, verify };
})();
