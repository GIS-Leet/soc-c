"""같은 HEAD의 반복 발행과 잘못된 번들 메타데이터를 합성 파일로 검증한다."""
import importlib.util
import pathlib
import tempfile
import unittest

def load(name):
    spec=importlib.util.spec_from_file_location(name,pathlib.Path(__file__).parents[1]/'scripts'/f'{name}.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
bump=load('bump-release');verify=load('verify-release')
class ReleaseTests(unittest.TestCase):
    def test_same_head_never_reuses_build(self):
        with tempfile.TemporaryDirectory() as d:
            project=pathlib.Path(d)/'project.yml';counter=pathlib.Path(d)/'counter';project.write_text('CURRENT_PROJECT_VERSION: "262"\n')
            self.assertEqual(bump.reserve(project,counter,263),264)
            self.assertEqual(bump.reserve(project,counter),265)
            project.write_text('CURRENT_PROJECT_VERSION: "262"\n')
            self.assertEqual(bump.reserve(project,counter),266)
    def test_wrong_target_and_missing_metadata(self):
        valid={'CFBundleIdentifier':'nyuheatgis','CFBundleVersion':'264','CFBundleShortVersionString':'1.1'}
        verify.validate_info(valid)
        with self.assertRaises(ValueError):verify.validate_info({**valid,'CFBundleIdentifier':'wrong'})
        with self.assertRaises(ValueError):verify.validate_info({**valid,'CFBundleVersion':'git-hash'})
if __name__=='__main__':unittest.main()
